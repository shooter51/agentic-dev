export type MessageType = 'clarification' | 'notification' | 'rejection' | 'status_update';

export type MessageStatus = 'pending' | 'completed' | 'expired';

export interface Message {
  id: string;
  taskId: string;
  fromAgent: string;
  toAgent: string;
  type: MessageType;
  content: string;
  response: string | null;
  status: MessageStatus;
  createdAt: string;
  respondedAt: string | null;
}

/**
 * Thrown by the message bus when a clarification request would form a
 * cycle in the wait-for graph, indicating a deadlock.
 */
export interface DeadlockError {
  code: 'DEADLOCK';
  from: string;
  to: string;
  message: string;
}
