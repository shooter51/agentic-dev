import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";
import type { Task, TaskHistoryEvent } from "../types";

export function useBoard(projectId: string) {
  return useQuery({
    queryKey: ["board", projectId],
    queryFn: () =>
      apiClient.get<Record<string, Task[]>>(
        `/api/projects/${projectId}/board`
      ),
    refetchOnWindowFocus: true,
  });
}

export function useTask(taskId: string) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => apiClient.get<Task>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useTaskHistory(taskId: string) {
  return useQuery({
    queryKey: ["task-history", taskId],
    queryFn: () =>
      apiClient.get<TaskHistoryEvent[]>(`/api/tasks/${taskId}/history`),
    enabled: !!taskId,
  });
}

export function useMoveTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, stage }: { taskId: string; stage: string }) =>
      apiClient.post<Task>(`/api/tasks/${taskId}/move`, { stage }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", variables.taskId] });
    },
  });
}
