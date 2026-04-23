import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { GateFailure } from '@agentic-dev/shared';
import type { Task } from '../db/schema/tasks';
import type { Project } from '../db/schema/projects';
import type { DB } from '../db';
import { tasks as tasksTable } from '../db/schema/tasks';
import { TaskRepository } from '../db/repositories/task.repository';
import { ProjectRepository } from '../db/repositories/project.repository';
import { taskHistory } from '../db/schema/task-history';
import type { PipelineTransition } from './transitions';
import type { PipelineGuard, GuardResult } from './guards';
import { buildTransitionTable } from './transitions';

// ---------------------------------------------------------------------------
// SSEBroadcaster — minimal interface; full implementation lives in the SSE
// module (not yet built). The pipeline calls emit() for task-updated events.
// ---------------------------------------------------------------------------

export interface SSEBroadcaster {
  emit(
    event: string,
    payload: { taskId: string; stage: string; assignedAgent: string | null },
  ): void;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface TransitionResult {
  success: boolean;
  newStage?: string;
  error?: string;
  failures?: GateFailure[];
}

// ---------------------------------------------------------------------------
// All valid pipeline stages (active + terminal)
// ---------------------------------------------------------------------------

const VALID_STAGES = [
  'todo',
  'product',
  'architecture',
  'development',
  'tech_lead_review',
  'devops_build',
  'manual_qa',
  'automation',
  'documentation',
  'devops_deploy',
  'arch_review',
  'done',
  'cancelled',
  'deferred',
] as const;

type ValidStage = (typeof VALID_STAGES)[number];

// ---------------------------------------------------------------------------
// TaskPipeline — the FSM controller
// ---------------------------------------------------------------------------

export class TaskPipeline {
  private readonly transitions: PipelineTransition[];
  private readonly taskRepo: TaskRepository;
  private readonly projectRepo: ProjectRepository;

  constructor(
    private readonly db: DB,
    private readonly sseBroadcaster: SSEBroadcaster,
  ) {
    this.transitions = buildTransitionTable(db);
    this.taskRepo = new TaskRepository(db);
    this.projectRepo = new ProjectRepository(db);
  }

  // -------------------------------------------------------------------------
  // advance — move a task forward to the next stage in the pipeline.
  // Bug-type tasks use the defect shortcut (skips documentation + arch_review).
  // -------------------------------------------------------------------------

  async advance(taskId: string, triggeredBy: string): Promise<TransitionResult> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      return { success: false, error: `Task not found: ${taskId}` };
    }

    const project = await this.projectRepo.findById(task.projectId);
    if (!project) {
      return { success: false, error: `Project not found: ${task.projectId}` };
    }

    const transition = this.findForwardTransition(task.stage, task.type);
    if (!transition) {
      return { success: false, error: `No forward transition from stage "${task.stage}"` };
    }

    if (transition.guard) {
      const guardResult = await this.runGuard(transition.guard, task, project);

      const mandatoryFailures = guardResult.failures.filter(
        (f) => this.isGateMandatory(f.gate, project),
      );

      if (mandatoryFailures.length > 0) {
        await this.logQualityGateFailures(taskId, task.stage, mandatoryFailures, triggeredBy);
        return { success: false, failures: mandatoryFailures };
      }

      const advisoryFailures = guardResult.failures.filter(
        (f) => !this.isGateMandatory(f.gate, project),
      );
      if (advisoryFailures.length > 0) {
        await this.logAdvisoryWarnings(taskId, task.stage, advisoryFailures, triggeredBy);
      }
    }

    await this.executeTransition(task, transition, triggeredBy);
    return { success: true, newStage: transition.to };
  }

  // -------------------------------------------------------------------------
  // reject — send a task backward to a prior stage (e.g. review → development).
  // -------------------------------------------------------------------------

  async reject(
    taskId: string,
    toStage: ValidStage,
    reason: string,
    triggeredBy: string,
  ): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const backTransition = this.transitions.find(
      (t) => t.from === task.stage && t.to === toStage,
    );
    if (!backTransition) {
      throw new Error(`Invalid rejection: "${task.stage}" → "${toStage}" — no such transition`);
    }

    await this.executeTransition(task, backTransition, triggeredBy);

    // Log the rejection event separately (with reason details)
    await this.insertHistory({
      taskId,
      event: 'rejection',
      fromValue: task.stage,
      toValue: toStage,
      agentId: triggeredBy,
      details: JSON.stringify({ reason }),
    });
  }

  // -------------------------------------------------------------------------
  // cancel — move a task to the terminal 'cancelled' state.
  // -------------------------------------------------------------------------

  async cancel(taskId: string, reason: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    await this.executeTransition(
      task,
      { from: task.stage, to: 'cancelled' },
      'operator',
    );

    await this.insertHistory({
      taskId,
      event: 'stage_change',
      fromValue: task.stage,
      toValue: 'cancelled',
      agentId: 'operator',
      details: JSON.stringify({ action: 'cancellation', reason }),
    });

    // Unblock the parent task if this was a defect child
    if (task.type === 'bug' && task.parentTaskId) {
      await this.checkParentUnblock(task.parentTaskId);
    }
  }

  // -------------------------------------------------------------------------
  // defer — park a task in the 'deferred' state, preserving the current stage
  // so it can be reopened to exactly where it was.
  // -------------------------------------------------------------------------

  async defer(taskId: string, reason: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const previousStage = task.stage;

    // Persist previousStage in metadata before transitioning
    const metadata: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');
    metadata['previousStage'] = previousStage;

    await this.db
      .update(tasksTable)
      .set({ metadata: JSON.stringify(metadata), updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, taskId));

    await this.executeTransition(
      task,
      { from: task.stage, to: 'deferred' },
      'operator',
    );

    await this.insertHistory({
      taskId,
      event: 'stage_change',
      fromValue: previousStage,
      toValue: 'deferred',
      agentId: 'operator',
      details: JSON.stringify({ action: 'deferral', reason }),
    });
  }

  // -------------------------------------------------------------------------
  // reopen — move a deferred task back to the stage it was deferred from.
  // -------------------------------------------------------------------------

  async reopen(taskId: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.stage !== 'deferred') throw new Error(`Only deferred tasks can be reopened`);

    const metadata: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');
    const previousStage = (metadata['previousStage'] as Task['stage'] | undefined) ?? 'todo';

    await this.executeTransition(
      task,
      { from: 'deferred', to: previousStage },
      'operator',
    );
  }

  // -------------------------------------------------------------------------
  // forceMove — operator override: moves a task to any valid stage, bypassing
  // all guards. Logs a stage_change event with skippedGuards: true in details.
  // -------------------------------------------------------------------------

  async forceMove(taskId: string, targetStage: ValidStage, triggeredBy: string): Promise<void> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (!(VALID_STAGES as readonly string[]).includes(targetStage)) {
      throw new Error(`Invalid target stage: "${targetStage}"`);
    }

    // Update stage directly — no guard execution
    await this.taskRepo.updateStage(task.id, targetStage as Task['stage']);

    // Emit SSE event
    this.sseBroadcaster.emit('task-updated', {
      taskId: task.id,
      stage: targetStage,
      assignedAgent: null,
    });

    // Log the forced move (stage_change event with extra details)
    await this.insertHistory({
      taskId,
      event: 'stage_change',
      fromValue: task.stage,
      toValue: targetStage,
      agentId: triggeredBy,
      details: JSON.stringify({ action: 'force_move', skippedGuards: true }),
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Finds the correct forward transition for the task's current stage.
   * Bug-type tasks use the defect shortcut (automation → devops_deploy).
   * Feature tasks use the standard path (automation → documentation).
   */
  private findForwardTransition(
    currentStage: Task['stage'],
    taskType: Task['type'],
  ): PipelineTransition | undefined {
    const candidates = this.transitions.filter((t) => t.from === currentStage);
    if (candidates.length === 0) return undefined;

    if (currentStage === 'automation') {
      // Bug tasks take the shortcut; everything else goes to documentation
      const targetStage = taskType === 'bug' ? 'devops_deploy' : 'documentation';
      return candidates.find((t) => t.to === targetStage);
    }

    // For all other stages, pick the first candidate that goes to a non-backward stage.
    // Backward stages are only reachable via reject(), so we prefer forward-only targets.
    const backwardStages: Task['stage'][] = ['development', 'architecture'];
    const forward = candidates.find((t) => !backwardStages.includes(t.to));
    return forward ?? candidates[0];
  }

  /** Run a guard, converting any thrown error into a failed GuardResult */
  private async runGuard(
    guard: PipelineGuard,
    task: Task,
    project: Project,
  ): Promise<GuardResult> {
    try {
      return await guard.check(task, project);
    } catch (err) {
      return {
        pass: false,
        failures: [
          {
            gate: 'guard_error',
            severity: 'mandatory',
            message: err instanceof Error ? err.message : String(err),
          },
        ],
      };
    }
  }

  /** Returns true when a gate is mandatory (default) per project configuration */
  private isGateMandatory(gate: string, project: Project): boolean {
    const config: Record<string, unknown> = JSON.parse(project.config ?? '{}');
    const qualityGates = config['qualityGates'] as
      | Record<string, { severity?: string }>
      | undefined;
    const gateConfig = qualityGates?.[gate];
    return gateConfig?.severity !== 'advisory'; // Default: mandatory
  }

  /** Execute a stage transition: update the task, log to history, emit SSE */
  private async executeTransition(
    task: Task,
    transition: { from: Task['stage']; to: Task['stage']; onTransition?: PipelineTransition['onTransition'] },
    triggeredBy: string,
  ): Promise<void> {
    await this.taskRepo.updateStage(task.id, transition.to);

    await this.insertHistory({
      taskId: task.id,
      event: 'stage_change',
      fromValue: task.stage,
      toValue: transition.to,
      agentId: triggeredBy,
    });

    if (transition.onTransition) {
      await transition.onTransition(task, { triggeredBy });
    }

    this.sseBroadcaster.emit('task-updated', {
      taskId: task.id,
      stage: transition.to,
      assignedAgent: null,
    });
  }

  /** Insert a row into the task_history table */
  private async insertHistory(row: {
    taskId: string;
    event: 'stage_change' | 'assignment' | 'message' | 'handoff' | 'rejection' | 'quality_gate';
    fromValue?: string;
    toValue?: string;
    agentId?: string;
    details?: string;
  }): Promise<void> {
    await this.db.insert(taskHistory).values({
      id: ulid(),
      taskId: row.taskId,
      event: row.event,
      fromValue: row.fromValue ?? null,
      toValue: row.toValue ?? null,
      agentId: row.agentId ?? null,
      details: row.details ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  /** Log mandatory gate failures to the quality_gate history event */
  private async logQualityGateFailures(
    taskId: string,
    stage: string,
    failures: GateFailure[],
    triggeredBy: string,
  ): Promise<void> {
    await this.insertHistory({
      taskId,
      event: 'quality_gate',
      fromValue: stage,
      agentId: triggeredBy,
      details: JSON.stringify({ failures }),
    });
  }

  /** Log advisory warnings (non-blocking) to the quality_gate history event */
  private async logAdvisoryWarnings(
    taskId: string,
    stage: string,
    failures: GateFailure[],
    triggeredBy: string,
  ): Promise<void> {
    await this.insertHistory({
      taskId,
      event: 'quality_gate',
      fromValue: stage,
      agentId: triggeredBy,
      details: JSON.stringify({ advisoryWarnings: failures }),
    });
  }

  /**
   * Check whether a parent task is now unblocked (all child defects resolved).
   * Best-effort — errors are swallowed so a cancel operation never fails.
   */
  private async checkParentUnblock(parentTaskId: string): Promise<void> {
    try {
      const childDefects = await this.taskRepo.findChildDefects(parentTaskId);
      const blocking = childDefects.filter(
        (d) => d.stage !== 'done' && d.stage !== 'cancelled',
      );
      if (blocking.length === 0) {
        // Parent is now unblocked — emit SSE for downstream consumers
        this.sseBroadcaster.emit('task-updated', {
          taskId: parentTaskId,
          stage: 'unblocked',
          assignedAgent: null,
        });
      }
    } catch {
      // Best-effort; do not propagate
    }
  }
}
