import { useUIStore } from "@/stores/ui-store";
import { useProjects } from "@/api/queries/projects";
import { useBoard } from "@/api/queries/tasks";
import { useAgents } from "@/api/queries/agents";
import { STAGES } from "@/hooks/use-board";

export function ProjectInfo() {
  const selectedProject = useUIStore((s) => s.selectedProject);
  const { data: projects } = useProjects();
  const { data: board } = useBoard(selectedProject ?? "all");
  const { data: agents } = useAgents();

  const project = projects?.find((p) => p.id === selectedProject);
  if (!project && selectedProject) return null;

  // Count tasks by status
  const totalTasks = board ? Object.values(board).flat().length : 0;
  const doneTasks = board?.["done"]?.length ?? 0;
  const activeTasks = totalTasks - doneTasks;
  const activeAgents = agents?.filter((a) => a.status === "working" || a.status === "busy").length ?? 0;

  // Find the furthest active stage
  let furthestStage = "";
  if (board) {
    for (let i = STAGES.length - 1; i >= 0; i--) {
      const stage = STAGES[i];
      if (stage !== "done" && board[stage]?.length) {
        furthestStage = stage;
        break;
      }
    }
  }

  const STAGE_LABELS: Record<string, string> = {
    todo: "Todo", product: "Product", architecture: "Architecture",
    development: "Development", tech_lead_review: "Tech Lead Review",
    devops_build: "DevOps Build", manual_qa: "Manual QA", automation: "Automation",
    documentation: "Docs", devops_deploy: "DevOps Deploy", arch_review: "Arch Review",
    done: "Done",
  };

  return (
    <div className="px-4 py-2 border-b bg-white flex items-center gap-6 text-xs flex-shrink-0">
      <div>
        <span className="text-gray-400 uppercase tracking-wide font-medium">Project</span>
        <p className="text-sm font-semibold text-gray-900">{project?.name ?? "All Projects"}</p>
      </div>
      {project?.path && (
        <div>
          <span className="text-gray-400 uppercase tracking-wide font-medium">Path</span>
          <p className="text-gray-600 font-mono">{project.path}</p>
        </div>
      )}
      <div>
        <span className="text-gray-400 uppercase tracking-wide font-medium">Tasks</span>
        <p className="text-gray-700">
          <span className="font-semibold text-gray-900">{activeTasks}</span> active
          {doneTasks > 0 && <span className="text-green-600 ml-1">· {doneTasks} done</span>}
        </p>
      </div>
      <div>
        <span className="text-gray-400 uppercase tracking-wide font-medium">Agents</span>
        <p className="text-gray-700">
          <span className="font-semibold text-blue-600">{activeAgents}</span> working
        </p>
      </div>
      {furthestStage && (
        <div>
          <span className="text-gray-400 uppercase tracking-wide font-medium">Lead Stage</span>
          <p className="text-gray-700 font-medium">{STAGE_LABELS[furthestStage] ?? furthestStage}</p>
        </div>
      )}
    </div>
  );
}
