export type Priority = "P0" | "P1" | "P2" | "P3" | "P4";
export type TaskType = "feature" | "bug" | "chore" | "spike";

export interface Task {
  id: string;
  title: string;
  description?: string;
  stage: string;
  priority: Priority;
  type: TaskType;
  assignedAgent?: string;
  projectId: string;
  beadsId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskHistoryEvent {
  id: string;
  taskId: string;
  eventType: string;
  fromStage?: string;
  toStage?: string;
  agentId?: string;
  message?: string;
  createdAt: string;
}

export type AgentStatus = "idle" | "busy" | "working" | "error" | "paused";

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTaskId?: string;
  lastHeartbeat?: string;
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
  key: string;
  value: string;
  updatedAt: string;
}
