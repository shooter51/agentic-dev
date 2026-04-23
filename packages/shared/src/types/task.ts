export enum TaskStage {
  Todo = 'todo',
  Product = 'product',
  Architecture = 'architecture',
  Development = 'development',
  TechLeadReview = 'tech_lead_review',
  DevopsBuild = 'devops_build',
  ManualQa = 'manual_qa',
  Automation = 'automation',
  Documentation = 'documentation',
  DevopsDeploy = 'devops_deploy',
  ArchReview = 'arch_review',
  Done = 'done',
  Cancelled = 'cancelled',
  Deferred = 'deferred',
}

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export type TaskType = 'feature' | 'bug' | 'task' | 'chore';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  stage: TaskStage;
  priority: TaskPriority;
  type: TaskType;
  assignedAgent: string | null;
  parentTaskId: string | null;
  beadsId: string | null;
  branchName: string | null;
  prUrl: string | null;
  /** JSON string containing task runtime metadata (coverage %, test results, etc.) */
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input shape when creating a new task — id and timestamps are generated server-side */
export interface NewTask {
  projectId: string;
  title: string;
  description?: string | null;
  stage: TaskStage;
  priority: TaskPriority;
  type: TaskType;
  assignedAgent?: string | null;
  parentTaskId?: string | null;
  beadsId?: string | null;
  branchName?: string | null;
  prUrl?: string | null;
  metadata?: string | null;
}
