import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";
import type { Memory } from "../types";

export function useAgentMemories(agentId: string) {
  return useQuery({
    queryKey: ["memories", agentId],
    queryFn: () =>
      apiClient.get<Memory[]>(`/api/agents/${agentId}/memories`),
    enabled: !!agentId,
  });
}

export function useEditMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      agentId,
      memoryId,
      value,
    }: {
      agentId: string;
      memoryId: string;
      value: string;
    }) =>
      apiClient.patch<Memory>(
        `/api/agents/${agentId}/memories/${memoryId}`,
        { value }
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["memories", variables.agentId],
      });
    },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      agentId,
      memoryId,
    }: {
      agentId: string;
      memoryId: string;
    }) =>
      apiClient.delete(
        `/api/agents/${agentId}/memories/${memoryId}`
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["memories", variables.agentId],
      });
    },
  });
}
