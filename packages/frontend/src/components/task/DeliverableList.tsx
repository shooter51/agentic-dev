import { useState } from "react";
import { useTaskDeliverables } from "@/api/queries/handoffs";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/common/MarkdownContent";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DeliverableListProps {
  taskId: string;
}

const TYPE_LABELS: Record<string, string> = {
  prd: "PRD",
  adr: "ADR",
  lld: "LLD",
  test_report: "Test Report",
  coverage_report: "Coverage Report",
  security_report: "Security Report",
  review_report: "Review Report",
  defect_report: "Defect Report",
};

export function DeliverableList({ taskId }: DeliverableListProps) {
  const { data: deliverables, isLoading } = useTaskDeliverables(taskId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-xs text-gray-400">Loading deliverables...</p>;
  }

  if (!deliverables || deliverables.length === 0) {
    return <p className="text-xs text-gray-400">No deliverables yet.</p>;
  }

  return (
    <div className="space-y-2">
      {deliverables.map((d) => {
        const isExpanded = expandedId === d.id;
        return (
          <div
            key={d.id}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            <button
              className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left"
              onClick={() => setExpandedId(isExpanded ? null : d.id)}
            >
              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                {TYPE_LABELS[d.type] ?? d.type}
              </Badge>
              <span className="text-sm font-medium text-gray-900 flex-1 truncate">
                {d.title}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {new Date(d.createdAt).toLocaleString()}
              </span>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              )}
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 border-t border-gray-100">
                <MarkdownContent content={d.content} className="max-h-64 overflow-y-auto" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
