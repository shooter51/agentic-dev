export type Priority = "P0" | "P1" | "P2" | "P3" | "P4";
export type TaskType = "feature" | "bug" | "chore" | "spike" | "task";

export interface Task {
  id: string;
  title: string;
  description?: string;
  stage: string;
  priority: Priority;
  type: TaskType;
  pipelineMode?: PipelineMode;
  assignedAgent?: string;
  projectId: string;
  beadsId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskHistoryEvent {
  id: string;
  taskId: string;
  event: string;       // was eventType
  fromValue?: string;  // was fromStage
  toValue?: string;    // was toStage
  agentId?: string;
  details?: string;    // JSON string with event-specific data
  createdAt: string;
}

export type PipelineMode = "standard" | "qa_automation";

export type AgentStatus = "idle" | "busy" | "error" | "paused" | "working";

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTaskId?: string;  // mapped from API's currentTask field
  currentTask?: string;    // raw API field name
  lastHeartbeat?: string;
  model?: string;
  specialization?: string;
  lastError?: string;
}

export interface Message {
  id: string;
  taskId: string;
  fromAgent?: string;
  toAgent?: string;
  type: "clarification" | "rejection" | "notification" | "response";
  content: string;
  status: "pending" | "resolved";
  threadId?: string;
  createdAt: string;
}

export interface MessageThread {
  id: string;
  messages: Message[];
}

export interface Memory {
  id: string;
  agentId: string;
  key?: string;
  value?: string;
  title?: string;
  content?: string;
  type?: string;
  updatedAt: string;
}
