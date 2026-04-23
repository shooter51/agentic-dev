import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

interface Handoff {
  id: string;
  taskId: string;
  fromStage: string;
  toStage: string;
  fromAgent: string;
  content: string;
  createdAt: string;
}

interface Deliverable {
  id: string;
  taskId: string;
  agentId: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
}

export function useTaskHandoffs(taskId: string) {
  return useQuery({
    queryKey: ["handoffs", taskId],
    queryFn: () => apiClient.get<Handoff[]>(`/api/tasks/${taskId}/handoffs`),
    enabled: !!taskId,
  });
}

export function useTaskDeliverables(taskId: string) {
  return useQuery({
    queryKey: ["deliverables", taskId],
    queryFn: () =>
      apiClient.get<Deliverable[]>(`/api/tasks/${taskId}/deliverables`),
    enabled: !!taskId,
  });
}
