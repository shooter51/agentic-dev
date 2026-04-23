# LLD-001: Orchestrator & Agent Lifecycle

**References:** ADR-0002, ADR-0003, ADR-0011

## Overview

The orchestrator is the central process that manages all agent lifecycle, task dispatch, tool execution, and inter-agent communication. It runs as a Fastify plugin within the backend server.

## File Structure

```
packages/backend/src/
  orchestrator/
    index.ts                  # Fastify plugin registration
    orchestrator.ts           # Core orchestrator class
    agent-runner.ts           # Agent run loop (API call cycle)
    agent-registry.ts         # Agent definitions and identity configs
    concurrency.ts            # Semaphore, priority queue
    context-builder.ts        # System prompt assembly with token budgets
    cost-tracker.ts           # API call cost tracking and circuit breaker
```

## Orchestrator Class

```typescript
// orchestrator.ts

interface OrchestratorConfig {
  maxConcurrentApiCalls: number;      // Default: 4
  perTaskCostCapUsd: number;          // Default: 10
  perHourCostCapUsd: number;          // Default: 50
  commandTimeoutMs: number;           // Default: 120_000
  messageTimeoutMs: number;           // Default: 600_000 (10 min)
}

class Orchestrator {
  private agents: Map<string, AgentState>;
  private semaphore: ConcurrencySemaphore;
  private messageBus: MessageBus;        // See LLD-004
  private pipeline: TaskPipeline;        // See LLD-003
  private toolExecutor: ToolExecutor;    // See LLD-005
  private memoryManager: MemoryManager;  // See LLD-006
  private ssebroadcaster: SSEBroadcaster; // See LLD-007
  private costTracker: CostTracker;
  private loopDetector: LoopDetector;
  private repoMutexes: Map<string, Mutex>; // One mutex per target repo path

  // Lifecycle
  async start(): Promise<void>;    // Called from Fastify onReady hook
  async stop(): Promise<void>;     // Called from Fastify onClose hook

  // Core loop
  private async runDispatchLoop(): Promise<void>;
  private async dispatchTask(agentId: string, taskId: string): Promise<void>;
  private async runAgent(agentId: string, taskId: string): Promise<void>;

  // Agent management
  getAgentStatus(agentId: string): AgentState;
  async setAgentStatus(agentId: string, status: AgentStatus): Promise<void>;
  async pauseAgent(agentId: string): Promise<void>;
  async resumeAgent(agentId: string): Promise<void>;
  async interruptAgent(agentId: string, messageId: string): Promise<void>;
}
```

## Dispatch Loop

The orchestrator runs a continuous dispatch loop:

```typescript
private async runDispatchLoop(): Promise<void> {
  while (this.running) {
    // 1. Find tasks ready for dispatch
    const readyTasks = await this.findReadyTasks();

    // 2. For each ready task, find an available agent in the correct lane
    for (const task of readyTasks) {
      const agent = this.findAvailableAgent(task.stage);
      if (!agent) continue; // All agents in this lane are busy

      // 3. Acquire semaphore slot (blocks if at max concurrent API calls)
      await this.semaphore.acquire(task.priority);

      // 4. Dispatch (non-blocking — agent runs in background)
      this.dispatchTask(agent.id, task.id)
        .catch((err) => this.handleAgentError(agent.id, task.id, err))
        .finally(() => this.semaphore.release());
    }

    // 5. Check for pending messages that need routing
    await this.routePendingMessages();

    // 6. Brief yield to prevent tight loop
    await sleep(1000);
  }
}
```

### Task Readiness Criteria

A task is "ready" when:
- It is in a stage that maps to an agent lane
- It is not blocked (no unresolved child defects, no pending sub-task convergence)
- It is not assigned to an agent that is currently working
- All quality gates for the previous stage passed (for forward transitions)

```typescript
private async findReadyTasks(): Promise<Task[]> {
  const childDefects = db.select({ id: tasks.id })
    .from(tasks)
    .where(and(
      eq(tasks.type, 'bug'),
      notInArray(tasks.stage, ['done', 'cancelled'])
    ));

  return db.select()
    .from(tasks)
    .where(and(
      notInArray(tasks.stage, ['todo', 'done', 'cancelled', 'deferred']),
      isNull(tasks.assignedAgent),
      // Not blocked by child defects
      notExists(
        db.select({ one: sql`1` })
          .from(childDefects.as('child_defects'))
          .where(sql`child_defects.parent_task_id = ${tasks.id}`)
      )
    ))
    .orderBy(
      // Priority: P0 first, then P1, etc.
      asc(tasks.priority),
      // Bugs before features
      desc(eq(tasks.type, 'bug')),
      // Oldest first within same priority
      asc(tasks.createdAt)
    );
}
```

## Agent Run Loop

```typescript
// agent-runner.ts

async function runAgentLoop(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  orchestrator: Orchestrator
): Promise<AgentResult> {
  const anthropic = new Anthropic();
  let messages: MessageParam[] = [];

  // Build initial system prompt
  const systemPrompt = buildSystemPrompt(agent, task, context);

  // Initial user message with task context
  messages.push({
    role: 'user',
    content: buildTaskPrompt(task, context.handoff, context.claudeMd)
  });

  while (true) {
    // Check cost circuit breaker
    await orchestrator.costTracker.checkBudget(task.id);

    // Make API call
    const startTime = Date.now();
    const response = await anthropic.messages.create({
      model: agent.model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      tools: getToolsForAgent(agent),
      messages,
    });
    const latencyMs = Date.now() - startTime;

    // Track API call
    await orchestrator.costTracker.trackCall({
      agentId: agent.id,
      taskId: task.id,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      latencyMs,
      status: 'success',
    });

    // Add assistant response to conversation
    messages.push({ role: 'assistant', content: response.content });

    // Check for end_turn (task complete)
    if (response.stop_reason === 'end_turn') {
      return parseAgentResult(response.content);
    }

    // Process tool calls
    if (response.stop_reason === 'tool_use') {
      const toolResults: ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        // Check for loop detection
        orchestrator.loopDetector.record(agent.id, block);

        // Execute tool via sandboxed executor
        const result = await orchestrator.toolExecutor.execute(
          agent,
          task,
          block,
          orchestrator
        );
        toolResults.push(result);
      }

      // Add tool results to conversation
      messages.push({ role: 'user', content: toolResults });
    }

    // Check if conversation is getting long — summarize if needed
    if (estimateTokens(messages) > 150_000) {
      messages = await summarizeConversation(messages, anthropic);
    }
  }
}
```

## Agent Registry

```typescript
// agent-registry.ts

const AGENT_DEFINITIONS: AgentIdentity[] = [
  {
    id: 'product-manager',
    role: 'Product Manager',
    lane: ['product'],
    model: 'opus',
    practices: PRODUCT_PRACTICES,
    allowedTools: ['read_file', 'list_files', 'search_files', 'git_status',
                   'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: PRODUCT_MANAGER_PROMPT,
  },
  {
    id: 'architect',
    role: 'Architect',
    lane: ['architecture', 'arch_review'],
    model: 'opus',
    practices: ARCHITECTURE_PRACTICES,
    allowedTools: ['read_file', 'write_file', 'list_files', 'search_files',
                   'git_status', 'git_commit',
                   'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: ARCHITECT_PROMPT,
  },
  {
    id: 'tech-lead',
    role: 'Tech Lead',
    lane: ['tech_lead_review'],
    model: 'opus',
    practices: TECH_LEAD_PRACTICES,
    allowedTools: ['read_file', 'list_files', 'search_files', 'run_command',
                   'git_status', 'run_tests', 'check_coverage',
                   'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: TECH_LEAD_PROMPT,
  },
  {
    id: 'dev-1',
    role: 'Developer (Senior)',
    lane: ['development'],
    model: 'opus',
    practices: DEVELOPER_PRACTICES,
    allowedTools: ['read_file', 'write_file', 'list_files', 'search_files',
                   'run_command', 'git_status', 'git_branch', 'git_commit',
                   'run_tests', 'check_coverage',
                   'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: DEVELOPER_PROMPT,
  },
  // dev-2 and dev-3: same as dev-1 but model: 'sonnet'
  {
    id: 'devops',
    role: 'DevOps Engineer',
    lane: ['devops_build', 'devops_deploy'],
    model: 'sonnet',
    practices: DEVOPS_PRACTICES,
    allowedTools: ['read_file', 'write_file', 'list_files', 'search_files',
                   'run_command', 'git_status', 'git_branch', 'git_commit',
                   'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: DEVOPS_PROMPT,
  },
  {
    id: 'manual-qa',
    role: 'Manual QA',
    lane: ['manual_qa'],
    model: 'sonnet',
    practices: QA_PRACTICES,
    allowedTools: ['read_file', 'list_files', 'search_files', 'run_command',
                   'run_tests',
                   'beads_create', 'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: MANUAL_QA_PROMPT,
  },
  {
    id: 'automation',
    role: 'QA Automation Engineer',
    lane: ['automation'],
    model: 'sonnet',
    practices: AUTOMATION_PRACTICES,
    allowedTools: ['read_file', 'write_file', 'list_files', 'search_files',
                   'run_command', 'git_status', 'git_branch', 'git_commit',
                   'run_tests', 'check_coverage',
                   'beads_create', 'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: AUTOMATION_PROMPT,
  },
  {
    id: 'documentation',
    role: 'Documentation Agent',
    lane: ['documentation'],
    model: 'sonnet',
    practices: DOCUMENTATION_PRACTICES,
    allowedTools: ['read_file', 'write_file', 'list_files', 'search_files',
                   'git_status', 'git_commit',
                   'beads_update', 'beads_list',
                   'create_memory', 'read_memories', 'update_memory', 'delete_memory'],
    systemPrompt: DOCUMENTATION_PROMPT,
  },
];
```

## Context Builder

```typescript
// context-builder.ts

interface ContextBudget {
  identity: number;       // 3,000 tokens
  tools: number;          // 2,000 tokens
  claudeMd: number;       // 2,000 tokens
  handoff: number;        // 4,000 tokens
  memories: number;       // 8,000 tokens
  conversationSummary: number; // 4,000 tokens
}

function buildSystemPrompt(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext
): string {
  const sections: string[] = [];

  // 1. Agent identity (always included, ~3K tokens)
  sections.push(buildIdentitySection(agent));

  // 2. Project CLAUDE.md (truncated to budget)
  if (context.claudeMd) {
    sections.push(truncateToTokens(context.claudeMd, BUDGET.claudeMd));
  }

  // 3. Relevant memories (scored and ranked, see LLD-006)
  const memories = context.memories;
  sections.push(buildMemoriesSection(memories, BUDGET.memories));

  // 4. Handoff document from previous stage
  if (context.handoff) {
    sections.push(truncateToTokens(context.handoff, BUDGET.handoff));
  }

  // 5. Conversation summary (if resuming interrupted work)
  if (context.conversationSummary) {
    sections.push(truncateToTokens(context.conversationSummary, BUDGET.conversationSummary));
  }

  return sections.join('\n\n---\n\n');
}
```

## Concurrency Semaphore

```typescript
// concurrency.ts

class ConcurrencySemaphore {
  private current: number = 0;
  private max: number;
  private queue: PriorityQueue<{ resolve: () => void; priority: string }>;

  constructor(max: number) {
    this.max = max;
    this.queue = new PriorityQueue((a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
  }

  async acquire(priority: string): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push({ resolve, priority });
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.pop();
    if (next) {
      this.current++;
      next.resolve();
    }
  }

  // Called on rate limit — temporarily reduce max
  reduceMax(): void {
    this.max = Math.max(1, this.max - 1);
    setTimeout(() => { this.max = Math.min(this.max + 1, this.originalMax); }, 60_000);
  }
}

const PRIORITY_ORDER: Record<string, number> = {
  P0: 0, P1: 1, P2: 2, P3: 3, P4: 4
};
```

## Cost Tracker

```typescript
// cost-tracker.ts

class CostTracker {
  async trackCall(call: ApiCallRecord): Promise<void> {
    await db.insert(apiCalls).values({
      id: ulid(),
      ...call,
      createdAt: new Date().toISOString(),
    });
  }

  async checkBudget(taskId: string): Promise<void> {
    // Per-task check
    const taskCost = await this.getTaskCost(taskId);
    if (taskCost > this.config.perTaskCostCapUsd) {
      throw new CostLimitError(`Task ${taskId} exceeded $${this.config.perTaskCostCapUsd} budget`);
    }

    // Per-hour check
    const hourCost = await this.getHourlyCost();
    if (hourCost > this.config.perHourCostCapUsd) {
      throw new CostLimitError(`Hourly spend exceeded $${this.config.perHourCostCapUsd} budget`);
    }
  }

  private async getTaskCost(taskId: string): Promise<number> {
    const calls = await db.select().from(apiCalls).where(eq(apiCalls.taskId, taskId));
    return calls.reduce((sum, call) => sum + this.calculateCost(call), 0);
  }

  private calculateCost(call: ApiCallRecord): number {
    // Pricing per model (configurable, updated when Anthropic changes prices)
    const pricing = MODEL_PRICING[call.model];
    return (call.inputTokens * pricing.inputPerToken)
         + (call.outputTokens * pricing.outputPerToken)
         + (call.cacheReadTokens * pricing.cacheReadPerToken)
         + (call.cacheWriteTokens * pricing.cacheWritePerToken);
  }
}
```

## Loop Detector

Detects when an agent gets stuck repeating the same tool calls with identical results.

```typescript
// loop-detector.ts

class LoopDetector {
  // Map of agentId -> rolling window of call signatures
  private history: Map<string, string[]> = new Map();
  private readonly threshold: number;

  constructor(threshold: number = 5) {
    this.threshold = threshold;
  }

  record(agentId: string, toolUse: ToolUseBlock): void {
    const signature = this.buildSignature(toolUse);
    const agentHistory = this.history.get(agentId) ?? [];
    agentHistory.push(signature);

    // Keep only the last N*2 entries to limit memory
    if (agentHistory.length > this.threshold * 2) {
      agentHistory.splice(0, agentHistory.length - this.threshold * 2);
    }
    this.history.set(agentId, agentHistory);

    // Check if the last `threshold` entries are all identical
    if (agentHistory.length >= this.threshold) {
      const recent = agentHistory.slice(-this.threshold);
      if (recent.every((sig) => sig === recent[0])) {
        throw new LoopDetectedError(
          `Agent ${agentId} repeated identical tool call ${this.threshold} times: ${toolUse.name}`
        );
      }
    }
  }

  private buildSignature(toolUse: ToolUseBlock): string {
    // Hash of tool name + serialized input — result hash is checked
    // after execution via recordResult()
    return `${toolUse.name}:${JSON.stringify(toolUse.input)}`;
  }

  recordResult(agentId: string, toolUse: ToolUseBlock, result: string): void {
    const resultHash = this.hashString(result);
    const agentHistory = this.history.get(agentId) ?? [];

    // Amend the last entry with the result hash
    if (agentHistory.length > 0) {
      agentHistory[agentHistory.length - 1] += `:${resultHash}`;
    }

    // Re-check with result included — triggers after 5 identical (call+result) pairs
    if (agentHistory.length >= this.threshold) {
      const recent = agentHistory.slice(-this.threshold);
      if (recent.every((sig) => sig === recent[0])) {
        throw new LoopDetectedError(
          `Agent ${agentId} repeated identical tool call+result ${this.threshold} times: ${toolUse.name}`
        );
      }
    }
  }

  private hashString(str: string): string {
    // Simple FNV-1a hash for fast comparison
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(36);
  }

  clear(agentId: string): void {
    this.history.delete(agentId);
  }
}
```

## Agent Status Management

```typescript
// In orchestrator.ts

async setAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
  // Update in-memory state
  const agentState = this.agents.get(agentId);
  if (agentState) {
    agentState.status = status;
  }

  // Persist to database
  await db.update(agents)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(agents.id, agentId));

  // Emit SSE event so dashboard updates in real time
  this.ssebroadcaster.emit('agent-status', {
    agentId,
    status,
    timestamp: new Date().toISOString(),
  });
}
```

## Interrupt Agent Flow

When a human sends a message to an agent that is currently working on a task, the agent must pause its current work, handle the interrupt, and then resume.

```typescript
// In orchestrator.ts

async interruptAgent(agentId: string, messageId: string): Promise<void> {
  const agentState = this.agents.get(agentId);
  if (!agentState || agentState.status !== 'working') {
    throw new Error(`Agent ${agentId} is not in a working state`);
  }

  // 1. Save current conversation state to SQLite
  const conversationSnapshot = {
    agentId,
    taskId: agentState.currentTaskId,
    messages: agentState.conversationMessages,
    systemPrompt: agentState.systemPrompt,
    savedAt: new Date().toISOString(),
  };
  await db.insert(conversationSnapshots).values({
    id: ulid(),
    ...conversationSnapshot,
    messages: JSON.stringify(conversationSnapshot.messages),
  });

  // 2. Update agent status
  await this.setAgentStatus(agentId, 'interrupted');

  // 3. Fetch the interrupt message
  const message = await db.select().from(messages)
    .where(eq(messages.id, messageId)).get();

  // 4. Process the interrupt in a short API call
  const anthropic = new Anthropic();
  const interruptResponse = await anthropic.messages.create({
    model: agentState.model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: buildInterruptSystemPrompt(agentState),
    messages: [
      { role: 'user', content: message!.content },
    ],
  });

  // 5. Save the interrupt response
  await db.update(messages)
    .set({
      response: extractTextContent(interruptResponse.content),
      status: 'completed',
      respondedAt: new Date().toISOString(),
    })
    .where(eq(messages.id, messageId));

  // 6. Resume original task with rehydrated conversation state
  const snapshot = await db.select().from(conversationSnapshots)
    .where(eq(conversationSnapshots.agentId, agentId))
    .orderBy(desc(conversationSnapshots.savedAt))
    .limit(1)
    .get();

  if (snapshot) {
    agentState.conversationMessages = JSON.parse(snapshot.messages);
    agentState.systemPrompt = snapshot.systemPrompt;
    await this.setAgentStatus(agentId, 'working');
    // Re-enter the agent run loop with restored state
    this.runAgent(agentId, snapshot.taskId).catch((err) =>
      this.handleAgentError(agentId, snapshot.taskId, err)
    );
  }
}
```

## Fastify Plugin Registration

```typescript
// index.ts

import fp from 'fastify-plugin';

export default fp(async function orchestratorPlugin(fastify) {
  const orchestrator = new Orchestrator({
    db: fastify.db,
    config: fastify.config.orchestrator,
  });

  // Decorate Fastify instance
  fastify.decorate('orchestrator', orchestrator);

  // Start on server ready
  fastify.addHook('onReady', async () => {
    await orchestrator.start();
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await orchestrator.stop();
  });
});
```

## Error Handling Integration

```typescript
// In runAgent — wraps the agent loop with error handling per ADR-0011

async function runAgentWithErrorHandling(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  orchestrator: Orchestrator
): Promise<AgentResult> {
  let retries = 0;
  let invalidOutputCount = 0;

  while (true) {
    try {
      return await runAgentLoop(agent, task, context, orchestrator);
    } catch (error) {
      if (error instanceof ApiError && error.isTransient) {
        retries++;
        if (retries > 5) {
          await orchestrator.setAgentStatus(agent.id, 'error');
          await orchestrator.ssebroadcaster.emit('agent-error', {
            agentId: agent.id, taskId: task.id, error: error.message
          });
          throw error;
        }

        // Respect Retry-After header on 429 responses
        let delay: number;
        if (error.statusCode === 429 && error.headers?.['retry-after']) {
          delay = parseInt(error.headers['retry-after'], 10) * 1000;
          orchestrator.semaphore.reduceMax();
        } else {
          delay = calculateBackoff(retries, { base: 1000, max: 60000, jitter: 0.3 });
        }
        await sleep(delay);
        continue;
      }

      if (error instanceof InvalidOutputError) {
        invalidOutputCount++;
        if (invalidOutputCount >= 3) {
          await orchestrator.setAgentStatus(agent.id, 'error');
          throw error;
        }
        // Retry with corrective prompt
        context.correctiveMessage = CORRECTIVE_PROMPTS[invalidOutputCount];
        continue;
      }

      if (error instanceof CostLimitError) {
        await orchestrator.setAgentStatus(agent.id, 'paused');
        await orchestrator.ssebroadcaster.emit('agent-error', {
          agentId: agent.id, taskId: task.id, error: error.message
        });
        throw error;
      }

      // Unknown error — fail to error state
      await orchestrator.setAgentStatus(agent.id, 'error');
      throw error;
    }
  }
}
```
