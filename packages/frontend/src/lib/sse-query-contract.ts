type QueryKeyFn = (data: unknown) => (string | string[])[][];

export const SSE_QUERY_MAP: Record<string, QueryKeyFn> = {
  "task-updated": (data) => {
    const d = data as { taskId: string; projectId?: string };
    return [
      ["tasks", d.taskId],
      ["board", d.projectId ?? "all"],
      ["task-history", d.taskId],
    ];
  },
  "agent-status": (data) => {
    const d = data as { agentId: string };
    return [["agents"], ["agents", d.agentId]];
  },
  "new-message": (data) => {
    const d = data as { taskId: string };
    return [["messages", d.taskId], ["messages", "pending"]];
  },
  "message-response": (data) => {
    const d = data as { taskId: string };
    return [["messages", d.taskId], ["messages", "pending"]];
  },
  handoff: (data) => {
    const d = data as { taskId: string; projectId?: string };
    return [
      ["tasks", d.taskId],
      ["handoffs", d.taskId],
      ["board", d.projectId ?? "all"],
    ];
  },
  "quality-gate": (data) => {
    const d = data as { taskId: string };
    return [["tasks", d.taskId]];
  },
  "defect-created": (data) => {
    const d = data as { projectId?: string };
    return [["board", d.projectId ?? "all"]];
  },
  "agent-error": (data) => {
    const d = data as { agentId: string };
    return [["agents"], ["agents", d.agentId]];
  },
  "self-repair-started": (data) => {
    const d = data as { taskId: string };
    return [["task-history", d.taskId]];
  },
  "self-repair-completed": (data) => {
    const d = data as { taskId: string };
    return [["task-history", d.taskId], ["tasks", d.taskId]];
  },
  "self-repair-failed": (data) => {
    const d = data as { taskId: string };
    return [["task-history", d.taskId]];
  },
  "self-repair-approval-needed": (data) => {
    const d = data as { taskId: string };
    return [["task-history", d.taskId]];
  },
};
