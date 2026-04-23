import { useMemo } from "react";
import { useBoard as useBoardQuery } from "../api/queries/tasks";
import { useUIStore } from "../stores/ui-store";
import type { Task } from "../api/types";

export const STAGES = [
  "todo",
  "product",
  "architecture",
  "development",
  "tech_lead_review",
  "devops_build",
  "manual_qa",
  "automation",
  "documentation",
  "devops_deploy",
  "arch_review",
  "done",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_GROUPS: Record<string, string[]> = {
  Build: ["todo", "product", "architecture", "development"],
  QA: ["tech_lead_review", "manual_qa", "automation"],
  Deploy: ["devops_build", "documentation", "devops_deploy", "arch_review", "done"],
};

export function findTask(
  board: Record<string, Task[]> | undefined,
  id: string | number
): Task | null {
  if (!board) return null;
  for (const tasks of Object.values(board)) {
    const task = tasks.find((t) => t.id === String(id));
    if (task) return task;
  }
  return null;
}

export function useFilteredBoard(projectId: string) {
  const { data: board, ...rest } = useBoardQuery(projectId);
  const activeFilters = useUIStore((s) => s.activeFilters);

  const filteredBoard = useMemo(() => {
    if (!board) return board;
    const result: Record<string, Task[]> = {};
    for (const stage of STAGES) {
      let tasks = board[stage] ?? [];
      if (activeFilters.agents.length > 0) {
        tasks = tasks.filter(
          (t) =>
            t.assignedAgent &&
            activeFilters.agents.includes(t.assignedAgent)
        );
      }
      if (activeFilters.priorities.length > 0) {
        tasks = tasks.filter((t) =>
          activeFilters.priorities.includes(t.priority)
        );
      }
      if (activeFilters.types.length > 0) {
        tasks = tasks.filter((t) => activeFilters.types.includes(t.type));
      }
      result[stage] = tasks;
    }
    return result;
  }, [board, activeFilters]);

  return { data: filteredBoard, rawData: board, ...rest };
}
