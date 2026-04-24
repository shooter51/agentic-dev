import { useTaskHistory } from "@/api/queries/tasks";
import { useAgentModel } from "@/api/queries/agents";
import { StageBadge } from "@/components/common/StageBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";

function WrenchIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-amber-500 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

interface TaskHistoryEventDisplayProps {
  agentId: string;
}

function TaskHistoryEventDisplay({ agentId }: TaskHistoryEventDisplayProps) {
  const agentModel = useAgentModel(agentId);
  return <AgentAvatar agentId={agentId} model={agentModel} size="sm" />;
}

interface TaskHistoryProps {
  taskId: string;
}

export function TaskHistory({ taskId }: TaskHistoryProps) {
  const { data: events, isLoading } = useTaskHistory(taskId);

  if (isLoading) {
    return <div className="text-sm text-gray-400 py-4 text-center">Loading history...</div>;
  }

  if (!events || events.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">No history yet.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {events.map((event, idx) => (
        <div key={event.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
            {idx < events.length - 1 && (
              <div className="w-px flex-1 bg-gray-200 mt-1" />
            )}
          </div>
          <div className="flex-1 pb-3">
            <div className="flex items-center gap-2 mb-0.5">
              {event.eventType === 'self_repair' ? (
                <WrenchIcon />
              ) : event.eventType === 'agent_error' ? (
                <span className="w-3.5 h-3.5 text-red-500 flex-shrink-0">&#x26A0;</span>
              ) : (
                event.agentId && <TaskHistoryEventDisplay agentId={event.agentId} />
              )}
              <span className="text-xs font-medium text-gray-700">
                {event.eventType === 'self_repair' ? 'Self-Repair' : event.eventType === 'agent_error' ? 'Agent Error' : event.eventType}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
            {event.eventType === 'self_repair' && event.message && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">{event.message}</p>
            )}
            {event.eventType === 'agent_error' && event.message && (
              <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 mt-1">{event.message}</p>
            )}
            {event.eventType !== 'self_repair' && event.fromStage && event.toStage && (
              <div className="flex items-center gap-1 mt-1">
                <StageBadge stage={event.fromStage} />
                <span className="text-xs text-gray-400">→</span>
                <StageBadge stage={event.toStage} />
              </div>
            )}
            {event.eventType !== 'self_repair' && event.message && (
              <p className="text-xs text-gray-600 mt-1">{event.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
