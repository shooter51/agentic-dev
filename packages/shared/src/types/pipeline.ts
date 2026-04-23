import type { Task } from './task';
import type { Project } from './project';
import type { TaskStage } from './task';

/**
 * A single edge in the pipeline FSM — from one stage to another,
 * with an optional quality-gate guard.
 */
export interface Transition {
  from: TaskStage;
  to: TaskStage;
  guard?: TransitionGuard;
  onTransition?: (task: Task, context: TransitionContext) => Promise<void>;
}

/** Context passed to the onTransition hook */
export interface TransitionContext {
  triggeredBy: string;
}

/**
 * A quality gate guard that runs before a forward pipeline transition.
 * Must return a GuardResult indicating whether the gate passed.
 */
export interface TransitionGuard {
  check: (task: Task, project: Project) => Promise<GuardResult>;
}

/** Result returned by a TransitionGuard.check() call */
export interface GuardResult {
  pass: boolean;
  failures: GateFailure[];
}

/**
 * Describes a single quality gate failure.
 * Mandatory failures block the transition; advisory ones log a warning only.
 */
export interface GateFailure {
  /** Identifier for the quality gate (e.g. 'unit_coverage', 'lint_clean') */
  gate: string;
  severity: 'mandatory' | 'advisory';
  message: string;
  /** Actual measured value, if applicable (e.g. "92%") */
  value?: string;
  /** Required threshold value, if applicable (e.g. "98%") */
  threshold?: string;
}
