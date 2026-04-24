import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/common/PriorityBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { TimeInStage } from "@/components/common/TimeInStage";
import { useMoveTask, useCancelTask } from "@/api/queries/tasks";
import { useAgentModel } from "@/api/queries/agents";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { ChevronRight, X } from "lucide-react";
import type { Task } from "@/api/types";

interface TaskCardProps {
  task: Task;
  compact?: boolean;
  isDragging?: boolean;
}

export function TaskCard({ task, compact, isDragging }: TaskCardProps) {
  const setSelectedTask = useUIStore((s) => s.setSelectedTask);
  const moveTask = useMoveTask();
  const cancelTask = useCancelTask();
  const agentModel = useAgentModel(task.assignedAgent);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTask(task.id);
  };

  if (compact) {
    return (
      <div
        className={cn(
          "p-2 rounded border bg-white flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors",
          isDragging && "opacity-50"
        )}
        onClick={handleClick}
      >
        <PriorityBadge priority={task.priority} />
        <span className="text-sm truncate flex-1 text-gray-800">
          {task.title}
        </span>
        {task.type === "bug" && (
          <Badge variant="destructive" className="text-xs">
            Bug
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
        isDragging && "opacity-50"
      )}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between mb-1">
        <PriorityBadge priority={task.priority} />
        <div className="flex items-center gap-1">
          {task.pipelineMode === "qa_automation" && (
            <Badge className="text-xs bg-violet-100 text-violet-700">
              QA
            </Badge>
          )}
          {task.type === "bug" && (
            <Badge variant="destructive" className="text-xs">
              Bug
            </Badge>
          )}
        </div>
      </div>
      <h4 className="text-sm font-medium mb-2 text-gray-900 line-clamp-2">
        {task.title}
      </h4>
      <div className="flex items-center justify-between">
        {task.assignedAgent ? (
          <AgentAvatar agentId={task.assignedAgent} model={agentModel} size="sm" />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <TimeInStage updatedAt={task.updatedAt} />
          {task.stage === "todo" && (
            <>
              <button
                className="ml-1 p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                title="Cancel task"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelTask.mutateAsync(task.id);
                }}
              >
                <X className="w-4 h-4" />
              </button>
              <button
                className="p-0.5 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                title="Move to Product"
                onClick={(e) => {
                  e.stopPropagation();
                  moveTask.mutateAsync({ taskId: task.id, stage: "product" });
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
      {task.beadsId && (
        <div className="mt-1">
          <span className="text-xs text-gray-400">{task.beadsId}</span>
        </div>
      )}
    </Card>
  );
}

interface SortableTaskCardProps {
  task: Task;
  compact?: boolean;
}

export function SortableTaskCard({ task, compact }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} compact={compact} isDragging={isDragging} />
    </div>
  );
}
