/**
 * orchestrator.ts — the central process manager.
 *
 * Responsibilities:
 *   - Dispatch loop: poll for ready tasks, find available agents, acquire semaphore
 *   - Agent lifecycle: idle → working → idle/error/paused
 *   - Status management: in-memory state + DB persistence + SSE broadcast
 *   - Interrupt flow: snapshot → process message → resume
 *   - Repo mutex: one per target repo path (prevents concurrent git ops)
 */

import { eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { AgentIdentity, AgentState, AgentStatus } from '@agentic-dev/shared';
import type { DB } from '../db';
import { agents as agentsTable } from '../db/schema/agents';
import { messages } from '../db/schema/messages';
import { projects } from '../db/schema/projects';
import type { Task } from '../db/schema/tasks';
import type { TaskPipeline } from '../pipeline';
import type { MessageBus } from '../messaging';
import type { HandoffService } from '../messaging';
import type { MemoryManager } from '../memory';
import type { ToolExecutor } from '../tools';
import { TaskRepository } from '../db/repositories/task.repository';
import { AgentRepository } from '../db/repositories/agent.repository';
import { HandoffRepository } from '../db/repositories/handoff.repository';
import { MemoryRepository } from '../db/repositories/memory.repository';
import { MessageRepository } from '../db/repositories/message.repository';
import { AGENT_DEFINITIONS, getAgentsForStage } from './agent-registry';
import { ConcurrencySemaphore } from './concurrency';
import { CostTracker } from './cost-tracker';
import { LoopDetector } from './loop-detector';
import { buildInterruptSystemPrompt, type AgentContext } from './context-builder';
import { runAgentWithErrorHandling } from './cli-runner';
import type { RunnerDeps } from './cli-runner';

// ---------------------------------------------------------------------------
// SSEBroadcaster — minimal interface; full implementation lives in the SSE
// module (not yet built). The orchestrator calls emit() for agent events.
// ---------------------------------------------------------------------------

export interface SSEBroadcaster {
  emit(event: string, payload: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Conversation snapshot schema (stored in SQLite as JSON)
// ---------------------------------------------------------------------------

interface ConversationSnapshot {
  id: string;
  agentId: string;
  taskId: string;
  messages: string; // JSON-stringified MessageParam[]
  systemPrompt: string;
  savedAt: string;
}

// We use the messages table for human interrupts — conversation snapshots
// are stored in-memory for simplicity (can be made persistent later).
// Using a simple Map keyed by agentId.
const conversationSnapshotStore = new Map<string, ConversationSnapshot>();

// ---------------------------------------------------------------------------
// Simple Mutex for per-repo serialisation
// ---------------------------------------------------------------------------

class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// OrchestratorConfig
// ---------------------------------------------------------------------------

export interface OrchestratorConfig {
  maxConcurrentApiCalls: number;  // Default: 4
  perTaskCostCapUsd: number;       // Default: 10
  perHourCostCapUsd: number;       // Default: 50
  commandTimeoutMs: number;        // Default: 120_000
  messageTimeoutMs: number;        // Default: 600_000
  dispatchIntervalMs: number;      // Default: 1_000
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentApiCalls: 4,
  perTaskCostCapUsd: 10,
  perHourCostCapUsd: 50,
  commandTimeoutMs: 120_000,
  messageTimeoutMs: 600_000,
  dispatchIntervalMs: 1_000,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class Orchestrator {
  /** In-memory state for all registered agents */
  readonly agents: Map<string, AgentState>;

  readonly semaphore: ConcurrencySemaphore;
  readonly costTracker: CostTracker;
  readonly loopDetector: LoopDetector;
  readonly toolExecutor: ToolExecutor;
  readonly sseBroadcaster: SSEBroadcaster;

  readonly messageBus: MessageBus;
  private readonly pipeline: TaskPipeline;
  readonly memoryManager: MemoryManager;
  private readonly handoffService: HandoffService;
  private readonly config: OrchestratorConfig;
  readonly db: DB;

  private readonly taskRepo: TaskRepository;
  private readonly agentRepo: AgentRepository;
  private readonly handoffRepo: HandoffRepository;

  /** Tracks tasks currently being dispatched to prevent double-dispatch */
  private readonly dispatchingTasks = new Set<string>();
  private readonly memoryRepo: MemoryRepository;
  private readonly messageRepo: MessageRepository;

  /** One mutex per target repo path — prevents concurrent git operations */
  private readonly repoMutexes: Map<string, Mutex> = new Map();

  private running = false;
  private dispatchLoopHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    db: DB;
    messageBus: MessageBus;
    pipeline: TaskPipeline;
    memoryManager: MemoryManager;
    handoffService: HandoffService;
    toolExecutor: ToolExecutor;
    sseBroadcaster: SSEBroadcaster;
    config?: Partial<OrchestratorConfig>;
  }) {
    this.db = options.db;
    this.messageBus = options.messageBus;
    this.pipeline = options.pipeline;
    this.memoryManager = options.memoryManager;
    this.handoffService = options.handoffService;
    this.toolExecutor = options.toolExecutor;
    this.sseBroadcaster = options.sseBroadcaster;
    this.config = { ...DEFAULT_CONFIG, ...options.config };

    this.semaphore = new ConcurrencySemaphore(this.config.maxConcurrentApiCalls);
    this.costTracker = new CostTracker(this.db, {
      perTaskCostCapUsd: this.config.perTaskCostCapUsd,
      perHourCostCapUsd: this.config.perHourCostCapUsd,
    });
    this.loopDetector = new LoopDetector();

    this.taskRepo = new TaskRepository(this.db);
    this.agentRepo = new AgentRepository(this.db);
    this.handoffRepo = new HandoffRepository(this.db);
    this.memoryRepo = new MemoryRepository(this.db);
    this.messageRepo = new MessageRepository(this.db);

    // Initialise in-memory agent state from definitions
    this.agents = new Map(
      AGENT_DEFINITIONS.map((def) => [
        def.id,
        {
          id: def.id,
          status: 'idle' as AgentStatus,
          currentTaskId: null,
          model: def.model,
          conversationMessages: [],
          systemPrompt: '',
        },
      ]),
    );
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the orchestrator — upsert agent records in DB, then begin the
   * dispatch loop. Called from Fastify onReady hook.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Ensure all agent definitions exist in the database
    await this.seedAgents();

    // Recover in-progress tasks from DB (in case of restart)
    await this.recoverAgentStates();

    // Start dispatch loop
    this.scheduleDispatch();
  }

  /**
   * Stop the orchestrator gracefully. Waits for any running dispatch cycle
   * to finish before returning. Called from Fastify onClose hook.
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.dispatchLoopHandle !== null) {
      clearTimeout(this.dispatchLoopHandle);
      this.dispatchLoopHandle = null;
    }
  }

  // -------------------------------------------------------------------------
  // Agent status management
  // -------------------------------------------------------------------------

  getAgentStatus(agentId: string): AgentState {
    const state = this.agents.get(agentId);
    if (!state) throw new Error(`Agent not found: ${agentId}`);
    return state;
  }

  async setAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    // Update in-memory state
    const agentState = this.agents.get(agentId);
    if (agentState) {
      agentState.status = status;
    }

    // Persist to database
    await this.db
      .update(agentsTable)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, agentId));

    // Emit SSE so the dashboard updates in real time
    this.sseBroadcaster.emit('agent-status', {
      agentId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  async pauseAgent(agentId: string): Promise<void> {
    await this.setAgentStatus(agentId, 'paused');
  }

  async resumeAgent(agentId: string): Promise<void> {
    const agentState = this.agents.get(agentId);
    if (!agentState) throw new Error(`Agent not found: ${agentId}`);

    if (agentState.status !== 'paused') {
      throw new Error(`Agent ${agentId} is not paused (current: ${agentState.status})`);
    }

    await this.setAgentStatus(agentId, 'idle');

    // If the agent had an assigned task, un-assign it so the dispatch loop
    // will pick it up again on the next cycle.
    if (agentState.currentTaskId) {
      const taskId = agentState.currentTaskId;
      const task = await this.taskRepo.findById(taskId);
      if (task) {
        // Clear the assignedAgent field so the task becomes eligible for re-dispatch
        await this.taskRepo.updateStage(task.id, task.stage, undefined);
      }
      agentState.currentTaskId = null;
    }
  }

  // -------------------------------------------------------------------------
  // Interrupt agent flow
  // -------------------------------------------------------------------------

  /**
   * Interrupt a working agent to handle a human message, then resume.
   *
   * 1. Save current conversation state
   * 2. Mark agent as interrupted
   * 3. Process the interrupt message in a short API call
   * 4. Save the response
   * 5. Resume the original task
   */
  async interruptAgent(agentId: string, messageId: string): Promise<void> {
    const agentState = this.agents.get(agentId);
    if (!agentState || agentState.status !== 'working') {
      throw new Error(`Agent ${agentId} is not in a working state`);
    }

    // 1. Save current conversation state
    const snapshot: ConversationSnapshot = {
      id: ulid(),
      agentId,
      taskId: agentState.currentTaskId ?? '',
      messages: JSON.stringify(agentState.conversationMessages),
      systemPrompt: agentState.systemPrompt,
      savedAt: new Date().toISOString(),
    };
    conversationSnapshotStore.set(agentId, snapshot);

    // 2. Update agent status to interrupted
    await this.setAgentStatus(agentId, 'interrupted');

    // 3. Fetch the interrupt message from DB
    const message = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .get();

    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    // 4. Process the interrupt in a short CLI call (non-blocking acknowledgement)
    const interruptSystemPrompt = buildInterruptSystemPrompt(agentState);
    const interruptResponseText = await this._runInterruptCli(
      agentState.model,
      interruptSystemPrompt,
      message.content,
    );

    // 5. Save the interrupt response to the message record
    await this.db
      .update(messages)
      .set({
        response: interruptResponseText,
        status: 'completed',
        respondedAt: new Date().toISOString(),
      })
      .where(eq(messages.id, messageId));

    // 6. Resume original task — restore conversation state and set back to working.
    //    NOTE: We do NOT call runAgent() here because the original runAgent() call
    //    that was interrupted still holds the repo mutex. The interrupted agent's
    //    run loop will be re-entered by the caller (routePendingMessages) which
    //    signals the agent runner to continue from where it left off.
    const savedSnapshot = conversationSnapshotStore.get(agentId);
    if (savedSnapshot && savedSnapshot.taskId) {
      agentState.conversationMessages = JSON.parse(savedSnapshot.messages);
      agentState.systemPrompt = savedSnapshot.systemPrompt;
      conversationSnapshotStore.delete(agentId);
      await this.setAgentStatus(agentId, 'working');
    } else {
      // No task to resume — return to idle
      await this.setAgentStatus(agentId, 'idle');
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch loop (private)
  // -------------------------------------------------------------------------

  private scheduleDispatch(): void {
    if (!this.running) return;
    this.dispatchLoopHandle = setTimeout(() => {
      this.runDispatchCycle()
        .catch((err) => {
          console.error('[Orchestrator] Dispatch cycle error:', err);
        })
        .finally(() => {
          this.scheduleDispatch();
        });
    }, this.config.dispatchIntervalMs);
  }

  private async runDispatchCycle(): Promise<void> {
    // 0. Watchdog: detect and fix stuck tasks
    await this.recoverStuckTasks();

    // 1. Find tasks ready for dispatch
    const readyTasks = await this.taskRepo.findReadyForDispatch();

    // 2. For each ready task, find an available agent in the correct lane
    for (const task of readyTasks) {
      // Skip tasks already being dispatched (prevents race between cycles)
      if (this.dispatchingTasks.has(task.id)) continue;

      const agent = this.findAvailableAgent(task.stage);
      if (!agent) continue; // All agents in this lane are busy

      // 3. Mark task as dispatching in-memory BEFORE the async semaphore wait
      this.dispatchingTasks.add(task.id);

      // 4. Acquire semaphore slot (blocks if at max concurrent API calls)
      await this.semaphore.acquire(task.priority);

      // 5. Mark task as assigned in DB
      await this.taskRepo.updateStage(task.id, task.stage, agent.id);

      // 6. Dispatch non-blocking — semaphore released in finally
      this.dispatchTask(agent.id, task.id)
        .catch((err) => this.handleAgentError(agent.id, task.id, err))
        .finally(() => {
          this.dispatchingTasks.delete(task.id);
          this.semaphore.release();
        });
    }

    // 6. Route any pending messages
    await this.routePendingMessages();
  }

  // -------------------------------------------------------------------------
  // Task dispatch (private)
  // -------------------------------------------------------------------------

  private async dispatchTask(agentId: string, taskId: string): Promise<void> {
    await this.setAgentStatus(agentId, 'working');

    const agentState = this.agents.get(agentId);
    if (agentState) {
      agentState.currentTaskId = taskId;
      agentState.conversationMessages = [];
    }

    await this.runAgent(agentId, taskId);
  }

  private async runAgent(agentId: string, taskId: string): Promise<void> {
    const agentDef = AGENT_DEFINITIONS.find((d) => d.id === agentId);
    if (!agentDef) throw new Error(`No agent definition for: ${agentId}`);

    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    // Build context
    const context = await this.buildContext(agentDef, task);

    try {
      // Acquire repo mutex to prevent concurrent git operations on the same repo
      const repoKey = task.projectId;
      const mutex = this.getRepoMutex(repoKey);
      const releaseMutex = await mutex.acquire();

      try {
        const runnerDeps: RunnerDeps = {
          costTracker: this.costTracker,
          messageBus: this.messageBus,
          memoryManager: this.memoryManager,
          db: this.db,
          sseBroadcaster: this.sseBroadcaster,
        };
        const result = await runAgentWithErrorHandling(agentDef, task, context, runnerDeps);

        // Advance the pipeline if the agent signalled completion
        if (result.completedViaSignal) {
          if (result.handoffContent) {
            await this.handoffService.createHandoff(
              taskId,
              task.stage,
              'next', // pipeline will determine actual next stage
              agentId,
              result.handoffContent,
            );
          }
          await this.pipeline.advance(taskId, agentId);
        }
      } finally {
        releaseMutex();
      }
    } finally {
      // Clear agent state on completion (regardless of outcome)
      const agentState = this.agents.get(agentId);
      if (agentState && agentState.status === 'working') {
        agentState.currentTaskId = null;
        agentState.conversationMessages = [];
        await this.setAgentStatus(agentId, 'idle');

        // Also clear task assignment so dispatch can re-pick it up if needed
        try {
          this.db.run(
            sql`UPDATE tasks SET assigned_agent = NULL, updated_at = ${new Date().toISOString()} WHERE id = ${taskId} AND assigned_agent = ${agentId}`,
          );
        } catch { /* best effort */ }
      }

      // Clear loop detector history for this agent
      this.loopDetector.clear(agentId);
    }
  }

  // -------------------------------------------------------------------------
  // Context building (private)
  // -------------------------------------------------------------------------

  private async buildContext(agent: AgentIdentity, task: Task): Promise<AgentContext> {
    const [handoff, ownMemories, sharedMemories] = await Promise.all([
      this.handoffService.getLatestHandoff(task.id),
      this.memoryManager.readOwn(agent.id, task.projectId),
      this.memoryManager.readShared(agent.id, task.projectId),
    ]);

    // Load project CLAUDE.md if it exists
    const claudeMd = await this.loadProjectClaudeMd(task.projectId);

    // Load project path for repoPath
    const project = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, task.projectId))
      .get();

    return {
      claudeMd,
      ownMemories,
      sharedMemories,
      projectId: task.projectId,
      repoPath: project?.path ?? null,
      handoff: handoff?.content ?? null,
      conversationSummary: null,
      correctiveMessage: null,
    };
  }

  private async loadProjectClaudeMd(projectId: string): Promise<string | null> {
    const project = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project) return null;

    const claudeMdPath = path.join(project.path, 'CLAUDE.md');
    try {
      return await fs.readFile(claudeMdPath, 'utf-8');
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Agent availability (private)
  // -------------------------------------------------------------------------

  private findAvailableAgent(stage: string): AgentIdentity | null {
    const candidates = getAgentsForStage(stage);
    for (const candidate of candidates) {
      const state = this.agents.get(candidate.id);
      if (state?.status === 'idle') {
        return candidate;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Message routing (private)
  // -------------------------------------------------------------------------

  private async routePendingMessages(): Promise<void> {
    // The MessageBus handles message delivery via events; the orchestrator
    // listens for 'message:new' events and routes interrupts accordingly.
    // This method handles any clarification messages that need to interrupt working agents.
    //
    // We iterate each working agent and check for pending messages addressed to them.
    for (const [agentId, agentState] of this.agents) {
      if (agentState.status !== 'working') continue;
      const pendingMessages = await this.messageRepo.findPendingForAgent(agentId);
      const clarifications = pendingMessages.filter((m) => m.type === 'clarification');
      for (const msg of clarifications) {
        await this.interruptAgent(msg.toAgent, msg.id).catch((err) => {
          console.error(`[Orchestrator] Failed to interrupt agent ${msg.toAgent}:`, err);
        });
        // Only handle one interrupt per agent per cycle
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Error handling (private)
  // -------------------------------------------------------------------------

  private handleAgentError(agentId: string, taskId: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Orchestrator] Agent ${agentId} failed on task ${taskId}:`, err);

    const agentState = this.agents.get(agentId);
    if (agentState) {
      agentState.currentTaskId = null;
      agentState.conversationMessages = [];
    }

    // Persist lastError to DB (best-effort — ALTER TABLE may have already run)
    try {
      this.db.run(
        sql`UPDATE agents SET last_error = ${errorMessage}, updated_at = ${new Date().toISOString()} WHERE id = ${agentId}`,
      );
    } catch (dbErr) {
      console.warn(`[Orchestrator] Failed to persist lastError for agent ${agentId}:`, dbErr);
    }

    // Emit SSE so the dashboard shows the error
    this.sseBroadcaster.emit('agent-error', {
      agentId,
      taskId,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });

    // Clear the assignedAgent on the task so it can be re-dispatched.
    // Use direct SQL to guarantee it runs even if the repo layer has issues.
    try {
      this.db.run(
        sql`UPDATE tasks SET assigned_agent = NULL, updated_at = ${new Date().toISOString()} WHERE id = ${taskId}`,
      );
      console.log(`[Orchestrator] Cleared assignedAgent on task ${taskId}`);
    } catch (clearErr) {
      console.error(`[Orchestrator] Failed to clear task assignment ${taskId}:`, clearErr);
    }

    this.setAgentStatus(agentId, 'error').catch((statusErr) => {
      console.error(`[Orchestrator] Failed to set agent ${agentId} to error state:`, statusErr);
    });

    // Auto-recover after 30s — reset to idle so the dispatch loop picks it up
    setTimeout(() => {
      const state = this.agents.get(agentId);
      if (state?.status === 'error') {
        console.log(`[Orchestrator] Auto-recovering agent ${agentId} from error state`);
        this.setAgentStatus(agentId, 'idle').catch((recoverErr) => {
          console.error(`[Orchestrator] Failed to auto-recover agent ${agentId}:`, recoverErr);
        });
      }
    }, 30_000);
  }

  // -------------------------------------------------------------------------
  // Interrupt CLI helper (private)
  // -------------------------------------------------------------------------

  /**
   * Runs a minimal claude CLI call to handle an interrupt message.
   * Returns the response text.
   */
  private _runInterruptCli(
    model: string,
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const claudeBin = process.env['CLAUDE_BIN'] ?? '/Users/tomgibson/.local/bin/claude';
    const modelId = model === 'opus' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';

    return new Promise<string>((resolve) => {
      const child = spawn(claudeBin, [
        '--print',
        '--model', modelId,
        '--system-prompt', systemPrompt,
        userMessage,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
      child.on('close', () => {
        resolve(output.trim() || '(no response)');
      });
      child.on('error', () => {
        resolve('(interrupt response unavailable)');
      });

      // Kill after 60s
      setTimeout(() => {
        if (!child.killed) child.kill();
        resolve(output.trim() || '(interrupt timed out)');
      }, 60_000);
    });
  }

  // -------------------------------------------------------------------------
  // Watchdog: detect and recover stuck tasks (private)
  // -------------------------------------------------------------------------

  /** Tracks consecutive failure count per task to prevent infinite retry loops */
  private readonly taskFailureCounts: Map<string, number> = new Map();
  private static readonly MAX_RETRIES = 3;
  private static readonly STUCK_THRESHOLD_MS = 120_000; // 2 minutes grace period

  private async recoverStuckTasks(): Promise<void> {
    try {
      const { tasks: tasksTable } = await import('../db/schema/tasks.js');
      const stuckTasks = await this.db
        .select()
        .from(tasksTable)
        .where(
          sql`assigned_agent IS NOT NULL AND stage NOT IN ('done', 'cancelled', 'deferred', 'todo')`,
        );

      const now = Date.now();

      for (const task of stuckTasks) {
        if (!task.assignedAgent) continue;
        if (this.dispatchingTasks.has(task.id)) continue;

        // Grace period: don't touch tasks assigned less than 2 minutes ago
        const updatedAt = new Date(task.updatedAt).getTime();
        if (now - updatedAt < Orchestrator.STUCK_THRESHOLD_MS) continue;

        const agentState = this.agents.get(task.assignedAgent);
        if (!agentState || (agentState.status !== 'idle' && agentState.status !== 'error')) continue;

        // Track failure count to prevent infinite retry loops
        const failures = (this.taskFailureCounts.get(task.id) ?? 0) + 1;
        this.taskFailureCounts.set(task.id, failures);

        if (failures > Orchestrator.MAX_RETRIES) {
          console.warn(`[Watchdog] Task ${task.id} failed ${failures} times — stopping retries. Manual intervention required.`);
          continue;
        }

        console.log(`[Watchdog] Recovering stuck task ${task.id} (agent ${task.assignedAgent} is ${agentState.status}, attempt ${failures}/${Orchestrator.MAX_RETRIES})`);
        this.db.run(
          sql`UPDATE tasks SET assigned_agent = NULL, updated_at = ${new Date().toISOString()} WHERE id = ${task.id}`,
        );
      }
    } catch (err) {
      console.warn('[Watchdog] Error:', err instanceof Error ? err.message : err);
    }
  }

  // -------------------------------------------------------------------------
  // Repo mutex (private)
  // -------------------------------------------------------------------------

  private getRepoMutex(key: string): Mutex {
    let mutex = this.repoMutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.repoMutexes.set(key, mutex);
    }
    return mutex;
  }

  // -------------------------------------------------------------------------
  // Seeding and recovery (private)
  // -------------------------------------------------------------------------

  private async seedAgents(): Promise<void> {
    const now = new Date().toISOString();
    for (const def of AGENT_DEFINITIONS) {
      await this.agentRepo.create({
        id: def.id,
        role: def.role,
        model: def.model,
        status: 'idle',
        currentTask: null,
        specialization: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private async recoverAgentStates(): Promise<void> {
    // On restart, reset any agents that were left in 'working' state to 'idle'
    // so they can be re-dispatched. Their tasks will also be reset via DB.
    const dbAgents = await this.agentRepo.findAll();
    for (const dbAgent of dbAgents) {
      if (dbAgent.status === 'working' || dbAgent.status === 'interrupted') {
        await this.agentRepo.updateStatus(dbAgent.id, 'idle', null);
        const memState = this.agents.get(dbAgent.id);
        if (memState) {
          memState.status = 'idle';
          memState.currentTaskId = null;
          memState.conversationMessages = [];
        }
      } else {
        // Sync in-memory state from DB
        const memState = this.agents.get(dbAgent.id);
        if (memState) {
          memState.status = dbAgent.status;
          memState.currentTaskId = dbAgent.currentTask ?? null;
        }
      }
    }
  }
}
