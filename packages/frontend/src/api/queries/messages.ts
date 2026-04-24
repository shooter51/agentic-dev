import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../client";
import type { Message } from "../types";

export function useMessages(taskId?: string) {
  return useQuery({
    queryKey: taskId ? ["messages", taskId] : ["messages"],
    queryFn: () =>
      taskId
        ? apiClient.get<Message[]>(`/api/tasks/${taskId}/messages`)
        : apiClient.get<Message[]>("/api/messages"),
  });
}

export function usePendingMessages() {
  return useQuery({
    queryKey: ["messages", "pending"],
    queryFn: () => apiClient.get<Message[]>("/api/messages?status=pending"),
    refetchInterval: 5_000,
  });
}

export function useSendOperatorMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      content,
    }: {
      taskId: string;
      content: string;
    }) =>
      apiClient.post<Message>(`/api/tasks/${taskId}/messages`, { content }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["messages", variables.taskId],
      });
      queryClient.invalidateQueries({ queryKey: ["messages", "pending"] });
    },
  });
}
