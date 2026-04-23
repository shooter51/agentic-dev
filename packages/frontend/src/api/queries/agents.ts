import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";
import type { Agent } from "../types";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiClient.get<Agent[]>("/api/agents"),
    refetchInterval: 3_000,
  });
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: ["agents", agentId],
    queryFn: () => apiClient.get<Agent>(`/api/agents/${agentId}`),
    enabled: !!agentId,
  });
}

export function usePauseAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) =>
      apiClient.post(`/api/agents/${agentId}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useResumeAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (agentId: string) =>
      apiClient.post(`/api/agents/${agentId}/resume`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}
