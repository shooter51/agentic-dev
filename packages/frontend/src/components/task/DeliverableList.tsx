import { useTaskDeliverables } from "@/api/queries/handoffs";
import { Badge } from "@/components/ui/badge";

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

  if (isLoading) {
    return <p className="text-xs text-gray-400">Loading deliverables...</p>;
  }

  if (!deliverables || deliverables.length === 0) {
    return <p className="text-xs text-gray-400">No deliverables yet.</p>;
  }

  return (
    <div className="space-y-2">
      {deliverables.map((d) => (
        <div
          key={d.id}
          className="border border-gray-200 rounded-lg p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px]">
              {TYPE_LABELS[d.type] ?? d.type}
            </Badge>
            <span className="text-sm font-medium text-gray-900">
              {d.title}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              {new Date(d.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
            {d.content.length > 500
              ? d.content.slice(0, 500) + "..."
              : d.content}
          </div>
        </div>
      ))}
    </div>
  );
}
