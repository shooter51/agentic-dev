import { useState } from "react";
import { useTaskHandoffs } from "@/api/queries/handoffs";
import { StageBadge } from "@/components/common/StageBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { MarkdownContent } from "@/components/common/MarkdownContent";
import { ChevronDown, ChevronRight } from "lucide-react";

interface HandoffViewerProps {
  taskId: string;
}

export function HandoffViewer({ taskId }: HandoffViewerProps) {
  const { data: handoffs, isLoading } = useTaskHandoffs(taskId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-xs text-gray-400">Loading handoffs...</p>;
  }

  if (!handoffs || handoffs.length === 0) {
    return <p className="text-xs text-gray-400">No handoffs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {handoffs.map((handoff) => {
        const isExpanded = expandedId === handoff.id;
        return (
          <div
            key={handoff.id}
            className="border border-gray-200 rounded-lg text-sm overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left"
              onClick={() => setExpandedId(isExpanded ? null : handoff.id)}
            >
              <AgentAvatar agentId={handoff.fromAgent} size="sm" />
              <StageBadge stage={handoff.fromStage} />
              <span className="text-gray-400">&rarr;</span>
              <StageBadge stage={handoff.toStage} />
              <span className="text-xs text-gray-400 ml-auto">
                {new Date(handoff.createdAt).toLocaleString()}
              </span>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              )}
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 border-t border-gray-100">
                <MarkdownContent content={handoff.content} className="max-h-64 overflow-y-auto" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
