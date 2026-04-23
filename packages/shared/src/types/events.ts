export enum SSEEventType {
  TaskUpdated = 'task-updated',
  AgentStatus = 'agent-status',
  NewMessage = 'new-message',
  MessageResponse = 'message-response',
  Handoff = 'handoff',
  QualityGate = 'quality-gate',
  DefectCreated = 'defect-created',
  AgentError = 'agent-error',
  /** Instructs the client to refetch all state (emitted on ring-buffer overflow) */
  FullSync = 'full-sync',
}

/**
 * Canonical payload shape for all SSE events.
 * Emitters must use this type — raw domain objects must not be sent directly.
 * Additional event-specific fields are carried via index signature.
 */
export interface SSEEventPayload {
  taskId: string;
  projectId: string;
  agentId?: string;
  stage?: string;
  timestamp: string;
  [key: string]: unknown;
}
