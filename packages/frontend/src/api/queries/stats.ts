import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

interface AgentCostEntry {
  agentId: string;
  role: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
}

interface CostStats {
  perAgent: AgentCostEntry[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedCostUsd: number;
  };
}

interface PipelineStats {
  tasksByStage: Record<string, number>;
  totalApiCalls: number;
  avgLatencyMs: number;
}

export function useCostStats() {
  return useQuery({
    queryKey: ["stats", "costs"],
    queryFn: () => apiClient.get<CostStats>("/api/stats/costs"),
    refetchInterval: 30_000,
  });
}

export function usePipelineStats() {
  return useQuery({
    queryKey: ["stats", "pipeline"],
    queryFn: () => apiClient.get<PipelineStats>("/api/stats/pipeline"),
    refetchInterval: 30_000,
  });
}
