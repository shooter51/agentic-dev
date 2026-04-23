/** A markdown handoff document written by an agent at stage completion */
export interface Handoff {
  id: string;
  taskId: string;
  fromStage: string;
  toStage: string;
  fromAgent: string;
  /** Full markdown content of the handoff document */
  content: string;
  createdAt: string;
}
