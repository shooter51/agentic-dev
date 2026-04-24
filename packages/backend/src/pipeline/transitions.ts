import type { GuardResult, GateFailure } from '@agentic-dev/shared';
import type { Task } from '../db/schema/tasks';
import type { DB } from '../db';
import {
  type PipelineGuard,
  createProductGuard,
  createArchitectureGuard,
  createDevelopmentGuard,
  createTechLeadGuard,
  createDevopsBuildGuard,
  createManualQaGuard,
  createAutomationGuard,
  createDocumentationGuard,
  createDevopsDeployGuard,
  createArchReviewGuard,
} from './guards';

// ---------------------------------------------------------------------------
// Internal transition types — use DB Task/Project (string-literal stages)
// rather than the shared Transition interface (which uses TaskStage enum).
// ---------------------------------------------------------------------------

export type TaskStageStr = Task['stage'];

/** Context passed to the onTransition hook */
export interface TransitionContext {
  triggeredBy: string;
}

/**
 * Internal transition edge. Uses DB-native types so stage string literals
 * are assignable from DB query results without casting.
 */
export interface PipelineTransition {
  from: TaskStageStr;
  to: TaskStageStr;
  guard?: PipelineGuard;
  onTransition?: (task: Task, context: TransitionContext) => Promise<void>;
}

export type { GuardResult, GateFailure };

/**
 * Builds the full transition table for the task pipeline FSM.
 *
 * Includes:
 * - Forward transitions for feature tasks (full pipeline)
 * - Defect-specific forward transition (automation → devops_deploy, skipping
 *   documentation and arch_review)
 * - Backward transitions (rejections back to a prior stage)
 *
 * Guards are factory-created so they have access to the DB for async checks.
 */
export function buildTransitionTable(db: DB): PipelineTransition[] {
  return [
    // -----------------------------------------------------------------------
    // Forward transitions — feature tasks (full pipeline)
    // -----------------------------------------------------------------------
    {
      from: 'todo',
      to: 'product',
    },
    {
      from: 'product',
      to: 'architecture',
      guard: createProductGuard(db),
    },
    {
      from: 'architecture',
      to: 'development',
      guard: createArchitectureGuard(db),
    },
    {
      from: 'development',
      to: 'tech_lead_review',
      guard: createDevelopmentGuard(db),
    },
    {
      from: 'tech_lead_review',
      to: 'devops_build',
      guard: createTechLeadGuard(db),
    },
    {
      from: 'devops_build',
      to: 'manual_qa',
      guard: createDevopsBuildGuard(db),
    },
    {
      from: 'manual_qa',
      to: 'automation',
      guard: createManualQaGuard(db),
    },
    {
      from: 'automation',
      to: 'documentation',
      guard: createAutomationGuard(db),
    },
    // QA Automation mode shortcut: automation -> done
    {
      from: 'automation',
      to: 'done',
    },
    {
      from: 'documentation',
      to: 'devops_deploy',
      guard: createDocumentationGuard(db),
    },
    {
      from: 'devops_deploy',
      to: 'arch_review',
      guard: createDevopsDeployGuard(db),
    },
    {
      from: 'arch_review',
      to: 'done',
      guard: createArchReviewGuard(db),
    },

    // -----------------------------------------------------------------------
    // Defect-specific forward transition
    // Bug-type tasks skip documentation and arch_review:
    //   automation → devops_deploy → done
    // -----------------------------------------------------------------------
    {
      from: 'automation',
      to: 'devops_deploy',
      guard: createAutomationGuard(db),
      onTransition: async (task: Task) => {
        // Guard: this transition is only valid for bug-type tasks.
        // Non-bug tasks must use the standard automation → documentation path.
        if (task.type !== 'bug') {
          throw new Error(
            `Defect shortcut (automation → devops_deploy) is only valid for bug-type tasks; ` +
              `task ${task.id} has type "${task.type}". Use the standard transition instead.`,
          );
        }
      },
    },

    // -----------------------------------------------------------------------
    // Backward transitions (rejections)
    // No guards — these are always permitted when triggered by an authorised agent.
    // -----------------------------------------------------------------------
    { from: 'tech_lead_review', to: 'development' },
    { from: 'devops_build', to: 'development' },
    { from: 'manual_qa', to: 'development' },
    { from: 'automation', to: 'development' },
    { from: 'arch_review', to: 'architecture' },
    { from: 'arch_review', to: 'development' },
  ];
}
