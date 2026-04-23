import { KanbanBoard } from "@/components/board/KanbanBoard";
import { TaskDetail } from "@/components/task/TaskDetail";
import { useUIStore } from "@/stores/ui-store";
import { useSSE } from "@/hooks/use-sse";

export function BoardPage() {
  const selectedProject = useUIStore((s) => s.selectedProject);
  useSSE();

  return (
    <div className="flex-1 overflow-hidden h-full">
      <KanbanBoard projectId={selectedProject ?? "all"} />
      <TaskDetail />
    </div>
  );
}
