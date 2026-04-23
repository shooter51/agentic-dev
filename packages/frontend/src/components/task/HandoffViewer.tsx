import { useTaskHandoffs } from "@/api/queries/handoffs";
import { StageBadge } from "@/components/common/StageBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";

interface HandoffViewerProps {
  taskId: string;
}

export function HandoffViewer({ taskId }: HandoffViewerProps) {
  const { data: handoffs, isLoading } = useTaskHandoffs(taskId);

  if (isLoading) {
    return <p className="text-xs text-gray-400">Loading handoffs...</p>;
  }

  if (!handoffs || handoffs.length === 0) {
    return <p className="text-xs text-gray-400">No handoffs yet.</p>;
  }

  return (
    <div className="space-y-3">
      {handoffs.map((handoff) => (
        <div
          key={handoff.id}
          className="border border-gray-200 rounded-lg p-3 text-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <AgentAvatar agentId={handoff.fromAgent} size="sm" />
            <StageBadge stage={handoff.fromStage} />
            <span className="text-gray-400">&rarr;</span>
            <StageBadge stage={handoff.toStage} />
            <span className="text-xs text-gray-400 ml-auto">
              {new Date(handoff.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
            {handoff.content}
          </div>
        </div>
      ))}
    </div>
  );
}
