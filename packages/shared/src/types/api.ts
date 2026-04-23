import type { Task, TaskPriority, TaskStage, TaskType, NewTask } from './task';
import type { Agent } from './agent';
import type { Memory, UpdateMemoryInput } from './memory';
import type { Message } from './message';
import type { Handoff } from './handoff';
import type { Deliverable } from './deliverable';
import type { Project, NewProject } from './project';
import type { GateFailure } from './pipeline';
import type { ApiCall } from './api-call';

// ---------------------------------------------------------------------------
// Project endpoints
// ---------------------------------------------------------------------------

export type CreateProjectInput = NewProject;

export interface UpdateProjectInput {
  name?: string;
  path?: string;
  config?: string | null;
}

// ---------------------------------------------------------------------------
// Task endpoints
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  type?: TaskType;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
}

export interface MoveTaskInput {
  stage: TaskStage;
}

export interface CancelTaskInput {
  reason: string;
}

export interface DeferTaskInput {
  reason: string;
}

/**
 * Board view returned by GET /api/projects/:projectId/board.
 * Keys are TaskStage values; values are the tasks in that column.
 */
export type BoardView = Record<string, Task[]>;

/**
 * Full task detail returned by GET /api/tasks/:id.
 * Includes related history, handoffs, messages, and deliverables.
 */
export interface TaskDetail {
  task: Task;
  history: TaskHistoryEntry[];
  handoffs: Handoff[];
  messages: Message[];
  deliverables: Deliverable[];
}

// ---------------------------------------------------------------------------
// Task history
// ---------------------------------------------------------------------------

export type TaskHistoryEvent =
  | 'stage_change'
  | 'assignment'
  | 'message'
  | 'handoff'
  | 'rejection'
  | 'quality_gate'
  | 'force_move'
  | 'cancellation';

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  event: TaskHistoryEvent;
  fromValue: string | null;
  toValue: string | null;
  agentId: string | null;
  /** JSON string with event-specific detail */
  details: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Agent endpoints
// ---------------------------------------------------------------------------

export interface UpdateAgentInput {
  specialization?: string | null;
}

// ---------------------------------------------------------------------------
// Message endpoints
// ---------------------------------------------------------------------------

/** Body for POST /api/agents/:id/message (operator → agent) */
export interface SendOperatorMessageInput {
  content: string;
}

// ---------------------------------------------------------------------------
// Memory endpoints
// ---------------------------------------------------------------------------

export type UpdateMemoryBody = UpdateMemoryInput;

// ---------------------------------------------------------------------------
// Stats endpoints
// ---------------------------------------------------------------------------

export interface AgentCostSummary {
  agentId: string;
  totalUsd: number;
  callCount: number;
}

export interface TaskCostSummary {
  taskId: string;
  totalUsd: number;
  callCount: number;
}

export interface CostStatsResponse {
  perAgent: AgentCostSummary[];
  perTask: TaskCostSummary[];
  /** Cost incurred in the last 60 minutes */
  lastHourUsd: number;
}

export interface PipelineStatsResponse {
  /** Average time (in seconds) tasks spend in each stage */
  averageStageDurationSeconds: Record<string, number>;
  /** Total tasks that completed (reached 'done') in the last 24 hours */
  throughputLast24h: number;
  /** Count of tasks currently in each stage */
  stageDistribution: Record<string, number>;
}
