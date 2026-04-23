import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ColumnHeader } from "./ColumnHeader";
import { SortableTaskCard } from "./TaskCard";
import { cn } from "@/lib/utils";
import type { Task } from "@/api/types";

interface KanbanColumnProps {
  stage: string;
  tasks: Task[];
  collapsed: boolean;
  compact: boolean;
  onToggleCollapse: () => void;
}

export function KanbanColumn({
  stage,
  tasks,
  collapsed,
  compact,
  onToggleCollapse,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  if (collapsed) {
    return (
      <div
        className="w-10 flex-shrink-0 bg-gray-50 border border-gray-200 rounded cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={onToggleCollapse}
      >
        <ColumnHeader stage={stage} count={tasks.length} collapsed />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-72 flex-shrink-0 flex flex-col bg-gray-50 rounded border border-gray-200",
        isOver && "ring-2 ring-blue-400/60 border-blue-300"
      )}
    >
      <ColumnHeader
        stage={stage}
        count={tasks.length}
        onToggle={onToggleCollapse}
      />
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto min-h-[80px]">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} compact={compact} />
          ))}
          {tasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-400 py-4">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
