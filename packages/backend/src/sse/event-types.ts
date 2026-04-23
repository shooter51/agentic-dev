// Canonical SSE event payload — emitters must NOT send raw domain objects.
export interface SSEEventPayload {
  taskId: string;
  projectId: string;
  agentId?: string;
  stage?: string;
  timestamp: string;
  [key: string]: unknown;
}

// Named event type constants
export const SSE_EVENTS = {
  TASK_UPDATED: 'task-updated',
  AGENT_STATUS: 'agent-status',
  NEW_MESSAGE: 'new-message',
  MESSAGE_RESPONSE: 'message-response',
  HANDOFF: 'handoff',
  QUALITY_GATE: 'quality-gate',
  DEFECT_CREATED: 'defect-created',
  AGENT_ERROR: 'agent-error',
  FULL_SYNC: 'full-sync',
} as const;

export type SSEEventType = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];

// Internal wire format for events stored in the ring buffer
export interface SSEEvent {
  id: string;
  event: string;
  data: string;
}
