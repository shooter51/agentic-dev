import { KanbanBoard } from "@/components/board/KanbanBoard";
import { ProjectInfo } from "@/components/board/ProjectInfo";
import { TaskDetail } from "@/components/task/TaskDetail";
import { useUIStore } from "@/stores/ui-store";
import { useSSE } from "@/hooks/use-sse";

export function BoardPage() {
  const selectedProject = useUIStore((s) => s.selectedProject);
  useSSE();

  return (
    <div className="flex-1 overflow-hidden h-full flex flex-col">
      <ProjectInfo />
      <KanbanBoard projectId={selectedProject ?? "all"} />
      <TaskDetail />
    </div>
  );
}
