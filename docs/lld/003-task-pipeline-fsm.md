# LLD-003: Task Pipeline FSM

**References:** ADR-0009

## Overview

The task pipeline is a finite state machine controlling task flow through 12 active stages plus 2 terminal states. Each transition has guard functions (quality gates) that must pass before the task advances.

## File Structure

```
packages/backend/src/
  pipeline/
    index.ts                # Pipeline exports
    fsm.ts                  # State machine definition
    transitions.ts          # Transition table and rules
    guards.ts               # Quality gate guard functions
    defect-flow.ts          # Defect auto-creation and shortened pipeline
    subtask-flow.ts         # Parallel sub-task management and convergence
    stage-agent-map.ts      # Maps stages to agent lanes
```

## State Machine

```typescript
// fsm.ts

interface Transition {
  from: TaskStage;
  to: TaskStage;
  guard?: TransitionGuard;
  onTransition?: (task: Task, context: TransitionContext) => Promise<void>;
}

interface TransitionGuard {
  check: (task: Task, project: Project) => Promise<GuardResult>;
}

interface GuardResult {
  pass: boolean;
  failures: GateFailure[];
}

interface GateFailure {
  gate: string;
  severity: 'mandatory' | 'advisory';
  message: string;
  value?: string;    // Actual value (e.g., "92%")
  threshold?: string; // Required value (e.g., "98%")
}

class TaskPipeline {
  private transitions: Transition[];

  constructor(private db: DB, private sseBroadcaster: SSEBroadcaster) {
    this.transitions = buildTransitionTable(db);
  }

  async advance(taskId: string, triggeredBy: string): Promise<TransitionResult> {
    const task = await this.db.tasks.findById(taskId);
    const project = await this.db.projects.findById(task.projectId);

    // Find forward transition from current stage
    // Bug-type tasks skip documentation and arch_review stages
    const transition = this.findForwardTransition(task.stage, task.type);
    if (!transition) {
      return { success: false, error: 'No forward transition from this stage' };
    }

    // Run guard (quality gate check)
    if (transition.guard) {
      const guardResult = await transition.guard.check(task, project);

      // Check mandatory gates
      const mandatoryFailures = guardResult.failures.filter(f =>
        this.isGateMandatory(f.gate, project)
      );

      if (mandatoryFailures.length > 0) {
        return { success: false, failures: mandatoryFailures };
      }

      // Log advisory failures (warn but allow)
      const advisoryFailures = guardResult.failures.filter(f =>
        !this.isGateMandatory(f.gate, project)
      );
      if (advisoryFailures.length > 0) {
        await this.logAdvisoryWarnings(taskId, advisoryFailures);
      }
    }

    // Execute transition
    await this.executeTransition(task, transition, triggeredBy);
    return { success: true, newStage: transition.to };
  }

  async reject(taskId: string, toStage: TaskStage, reason: string, triggeredBy: string): Promise<void> {
    const task = await this.db.tasks.findById(taskId);

    // Validate backward transition exists
    const backTransition = this.transitions.find(t =>
      t.from === task.stage && t.to === toStage
    );
    if (!backTransition) {
      throw new Error(`Invalid rejection: ${task.stage} → ${toStage}`);
    }

    await this.executeTransition(task, backTransition, triggeredBy);

    // Log rejection in task history
    await this.db.taskHistory.create({
      taskId, event: 'rejection',
      fromValue: task.stage, toValue: toStage,
      agentId: triggeredBy,
      details: JSON.stringify({ reason }),
    });
  }

  async cancel(taskId: string, reason: string): Promise<void> {
    const task = await this.db.tasks.findById(taskId);
    await this.executeTransition(task, { from: task.stage, to: 'cancelled' }, 'operator');
    await this.db.taskHistory.create({
      taskId, event: 'cancellation',
      fromValue: task.stage, toValue: 'cancelled',
      agentId: 'operator',
      details: JSON.stringify({ reason }),
    });

    // Unblock parent if this was a defect
    if (task.type === 'bug' && task.parentTaskId) {
      await this.checkParentUnblock(task.parentTaskId);
    }
  }

  async defer(taskId: string, reason: string): Promise<void> {
    const task = await this.db.tasks.findById(taskId);
    const previousStage = task.stage;

    // Save previousStage to task metadata before transitioning
    const metadata = JSON.parse(task.metadata || '{}');
    metadata.previousStage = previousStage;
    await this.db.tasks.update(task.id, { metadata: JSON.stringify(metadata) });

    await this.executeTransition(task, { from: task.stage, to: 'deferred' }, 'operator');
    await this.db.taskHistory.create({
      taskId, event: 'stage_change',
      fromValue: previousStage, toValue: 'deferred',
      agentId: 'operator',
      details: JSON.stringify({ reason }),
    });
  }

  async reopen(taskId: string): Promise<void> {
    const task = await this.db.tasks.findById(taskId);
    if (task.stage !== 'deferred') throw new Error('Only deferred tasks can be reopened');
    const previousStage = JSON.parse(task.metadata || '{}').previousStage || 'todo';
    await this.executeTransition(task, { from: 'deferred', to: previousStage }, 'operator');
  }

  private isGateMandatory(gate: string, project: Project): boolean {
    const config = JSON.parse(project.config || '{}');
    const gateConfig = config.qualityGates?.[gate];
    return gateConfig?.severity !== 'advisory'; // Default: mandatory
  }

  async forceMove(taskId: string, targetStage: TaskStage, triggeredBy: string): Promise<void> {
    const task = await this.db.tasks.findById(taskId);

    // Validate target stage is a valid stage
    const validStages: TaskStage[] = [
      'todo', 'product', 'architecture', 'development', 'tech_lead_review',
      'devops_build', 'manual_qa', 'automation', 'documentation',
      'devops_deploy', 'arch_review', 'done', 'cancelled', 'deferred',
    ];
    if (!validStages.includes(targetStage)) {
      throw new Error(`Invalid target stage: ${targetStage}`);
    }

    // Perform transition without running guards
    await this.executeTransition(task, { from: task.stage, to: targetStage }, triggeredBy);

    // Log as force_move event
    await this.db.taskHistory.create({
      taskId, event: 'force_move',
      fromValue: task.stage, toValue: targetStage,
      agentId: triggeredBy,
      details: JSON.stringify({ skippedGuards: true }),
    });
  }

  private async executeTransition(task: Task, transition: Transition, triggeredBy: string): Promise<void> {
    // Update task stage (also clears assignedAgent)
    await this.db.tasks.updateStage(task.id, transition.to);

    // Log in task history
    await this.db.taskHistory.create({
      taskId: task.id, event: 'stage_change',
      fromValue: task.stage, toValue: transition.to,
      agentId: triggeredBy,
    });

    // Run onTransition hook if defined
    if (transition.onTransition) {
      await transition.onTransition(task, { triggeredBy });
    }

    // Emit SSE event
    this.sseBroadcaster.emit('task-updated', {
      taskId: task.id, stage: transition.to, assignedAgent: null,
    });
  }
}
```

## Transition Table

```typescript
// transitions.ts

function buildTransitionTable(db: DB): Transition[] {
  return [
    // Forward transitions (feature tasks — full pipeline)
    { from: 'todo', to: 'product' },
    { from: 'product', to: 'architecture', guard: createProductGuard(db) },
    { from: 'architecture', to: 'development', guard: createArchitectureGuard(db) },
    { from: 'development', to: 'tech_lead_review', guard: createDevelopmentGuard(db) },
    { from: 'tech_lead_review', to: 'devops_build', guard: createTechLeadGuard(db) },
    { from: 'devops_build', to: 'manual_qa', guard: createDevopsBuildGuard(db) },
    { from: 'manual_qa', to: 'automation', guard: createManualQaGuard(db) },
    { from: 'automation', to: 'documentation', guard: createAutomationGuard(db) },
    { from: 'documentation', to: 'devops_deploy', guard: createDocumentationGuard(db) },
    { from: 'devops_deploy', to: 'arch_review', guard: createDevopsDeployGuard(db) },
    { from: 'arch_review', to: 'done', guard: createArchReviewGuard(db) },

    // Defect-specific forward transitions (skip documentation & arch_review)
    {
      from: 'automation', to: 'devops_deploy',
      guard: createAutomationGuard(db),
      onTransition: async (task) => {
        // Only applies to bug-type tasks; feature tasks use the normal path
        if (task.type !== 'bug') throw new Error('Use standard transition for non-bug tasks');
      },
    },

    // Backward transitions (rejections)
    { from: 'tech_lead_review', to: 'development' },
    { from: 'devops_build', to: 'development' },
    { from: 'manual_qa', to: 'development' },
    { from: 'automation', to: 'development' },
    { from: 'arch_review', to: 'architecture' },
    { from: 'arch_review', to: 'development' },
  ];
}

// Guard factory — returns TransitionGuard with database access
function createDevelopmentGuard(db: DB): TransitionGuard {
  return {
    async check(task, project) {
      return developmentGuardCheck(task, project, db);
    },
  };
}

// Similarly for all other guards:
// createProductGuard, createArchitectureGuard, createTechLeadGuard,
// createDevopsBuildGuard, createManualQaGuard, createAutomationGuard,
// createDocumentationGuard, createDevopsDeployGuard, createArchReviewGuard
```

## Guard Functions

```typescript
// guards.ts

async function developmentGuardCheck(task: Task, project: Project, db: DB): Promise<GuardResult> {
  const failures: GateFailure[] = [];
  const meta = JSON.parse(task.metadata || '{}');

  // Unit test coverage — value written by run_tests tool (see LLD-005)
  if ((meta.unitCoverage ?? 0) < 98) {
    failures.push({
      gate: 'unit_coverage', severity: 'mandatory',
      message: 'Unit test coverage below 98%',
      value: `${meta.unitCoverage}%`, threshold: '98%',
    });
  }

  // Pact coverage — value written by run_tests tool (see LLD-005)
  if ((meta.pactCoverage ?? 0) < 100) {
    failures.push({
      gate: 'pact_coverage', severity: 'mandatory',
      message: 'Pact contract coverage below 100%',
      value: `${meta.pactCoverage}%`, threshold: '100%',
    });
  }

  // All tests passing — value written by run_tests tool (see LLD-005)
  if (!meta.allTestsPassing) {
    failures.push({
      gate: 'tests_passing', severity: 'mandatory',
      message: 'Not all tests are passing',
    });
  }

  // No lint errors
  if (meta.lintErrors > 0) {
    failures.push({
      gate: 'lint_clean', severity: 'mandatory',
      message: `${meta.lintErrors} lint errors found`,
    });
  }

  // Check for stubs (search codebase)
  if (meta.stubsFound > 0) {
    failures.push({
      gate: 'no_stubs', severity: 'mandatory',
      message: `${meta.stubsFound} stub implementations found`,
    });
  }

  // Sub-task convergence check
  const subTasks = await db.tasks.findSubTasks(task.id);
  if (subTasks.length > 0) {
    const incomplete = subTasks.filter(st => st.stage !== 'tech_lead_review' && st.stage !== 'done');
    if (incomplete.length > 0) {
      failures.push({
        gate: 'subtasks_complete', severity: 'mandatory',
        message: `${incomplete.length} sub-tasks not yet complete`,
      });
    }
  }

  return { pass: failures.length === 0, failures };
}

const automationGuard: TransitionGuard = {
  async check(task, project): Promise<GuardResult> {
    const failures: GateFailure[] = [];
    const meta = JSON.parse(task.metadata || '{}');

    if ((meta.integrationCoverage ?? 0) < 90) {
      failures.push({
        gate: 'integration_coverage', severity: 'mandatory',
        message: 'Integration test coverage below 90%',
        value: `${meta.integrationCoverage}%`, threshold: '90%',
      });
    }

    if ((meta.e2eApiCoverage ?? 0) < 85) {
      failures.push({
        gate: 'e2e_api_coverage', severity: 'mandatory',
        message: 'E2E API test coverage below 85%',
        value: `${meta.e2eApiCoverage}%`, threshold: '85%',
      });
    }

    if ((meta.e2eUiCoverage ?? 0) < 85) {
      failures.push({
        gate: 'e2e_ui_coverage', severity: 'mandatory',
        message: 'E2E UI test coverage below 85%',
        value: `${meta.e2eUiCoverage}%`, threshold: '85%',
      });
    }

    // 3 consecutive passing runs
    if ((meta.consecutivePassingRuns ?? 0) < 3) {
      failures.push({
        gate: 'test_stability', severity: 'mandatory',
        message: `Only ${meta.consecutivePassingRuns}/3 consecutive passing runs`,
      });
    }

    return { pass: failures.length === 0, failures };
  }
};

// Similar guard functions for: productGuard, architectureGuard,
// techLeadGuard, devopsBuildGuard, manualQaGuard,
// documentationGuard, devopsDeployGuard, archReviewGuard
```

## Stage-to-Agent Mapping

```typescript
// stage-agent-map.ts

const STAGE_AGENT_MAP: Record<string, string[]> = {
  product: ['product-manager'],
  architecture: ['architect'],
  development: ['dev-1', 'dev-2', 'dev-3'],
  tech_lead_review: ['tech-lead'],
  devops_build: ['devops'],
  manual_qa: ['manual-qa'],
  automation: ['automation'],
  documentation: ['documentation'],
  devops_deploy: ['devops'],
  arch_review: ['architect'],
};
```

## Defect Auto-Flow

```typescript
// defect-flow.ts

async function createDefectTask(
  parentTask: Task,
  defect: DefectReport,
  db: DB
): Promise<Task> {
  const task = await db.tasks.create({
    projectId: parentTask.projectId,
    title: `[BUG] ${defect.title}`,
    description: defect.body,
    stage: 'development',   // Defects skip product & architecture
    priority: defect.severity === 'critical' ? 'P0' : 'P1',
    type: 'bug',
    parentTaskId: parentTask.id,
    beadsId: defect.beadsId,
  });

  // Create Beads issue
  // await beadsCreate(...)

  return task;
}

async function checkParentUnblock(parentTaskId: string, db: DB): Promise<boolean> {
  const childDefects = await db.tasks.findChildDefects(parentTaskId);
  const blocking = childDefects.filter(d =>
    !['done', 'cancelled'].includes(d.stage)
  );
  return blocking.length === 0;
}
```

## Subtask Convergence

```typescript
// subtask-flow.ts

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function mergeSubTaskBranches(
  parentTask: Task,
  db: DB,
  pipeline: TaskPipeline
): Promise<MergeResult> {
  const subTasks = await db.tasks.findSubTasks(parentTask.id);

  // Verify all sub-tasks have reached tech_lead_review or done
  const notReady = subTasks.filter(
    st => st.stage !== 'tech_lead_review' && st.stage !== 'done'
  );
  if (notReady.length > 0) {
    return { success: false, error: `${notReady.length} sub-tasks not ready` };
  }

  const parentBranch = parentTask.branch; // e.g., "feature/PROJ-123"
  const repoPath = (await db.projects.findById(parentTask.projectId)).path;
  const results: SubTaskMergeResult[] = [];

  // Sequentially merge each sub-task branch into the parent feature branch
  for (const subTask of subTasks) {
    if (subTask.stage === 'done') continue; // Already merged

    try {
      // Checkout parent branch
      await execFileAsync('git', ['checkout', parentBranch], { cwd: repoPath });

      // Merge sub-task branch (no fast-forward to preserve history)
      await execFileAsync('git', [
        'merge', '--no-ff',
        subTask.branch,
        '-m', `Merge sub-task ${subTask.id}: ${subTask.title}`,
      ], { cwd: repoPath });

      results.push({ subTaskId: subTask.id, success: true });
    } catch (error: any) {
      // Merge conflict — abort merge and send sub-task back to development
      await execFileAsync('git', ['merge', '--abort'], { cwd: repoPath }).catch(() => {});

      await pipeline.reject(
        subTask.id,
        'development',
        `Merge conflict with parent branch ${parentBranch}: ${error.message}`,
        'system'
      );

      results.push({
        subTaskId: subTask.id,
        success: false,
        error: `Merge conflict: ${error.message}`,
      });
    }
  }

  const failed = results.filter(r => !r.success);
  return {
    success: failed.length === 0,
    merged: results.filter(r => r.success).length,
    conflicted: failed.length,
    details: results,
  };
}

interface SubTaskMergeResult {
  subTaskId: string;
  success: boolean;
  error?: string;
}

interface MergeResult {
  success: boolean;
  error?: string;
  merged?: number;
  conflicted?: number;
  details?: SubTaskMergeResult[];
}
```
