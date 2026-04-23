import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

interface Project {
  id: string;
  name: string;
  path: string;
  config: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiClient.get<Project[]>("/api/projects"),
  });
}
