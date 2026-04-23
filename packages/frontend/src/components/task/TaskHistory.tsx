import { useTaskHistory } from "@/api/queries/tasks";
import { StageBadge } from "@/components/common/StageBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";

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
              {event.agentId && (
                <AgentAvatar agentId={event.agentId} size="sm" />
              )}
              <span className="text-xs font-medium text-gray-700">
                {event.eventType}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
            {event.fromStage && event.toStage && (
              <div className="flex items-center gap-1 mt-1">
                <StageBadge stage={event.fromStage} />
                <span className="text-xs text-gray-400">→</span>
                <StageBadge stage={event.toStage} />
              </div>
            )}
            {event.message && (
              <p className="text-xs text-gray-600 mt-1">{event.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
