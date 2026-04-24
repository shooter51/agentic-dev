import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../client";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  extension: string;
  language: string;
}

export function useDirectoryListing(projectId: string | null, dirPath: string) {
  return useQuery({
    queryKey: ["files", projectId, dirPath],
    queryFn: () =>
      apiClient.get<FileEntry[]>(
        `/api/projects/${projectId}/files?path=${encodeURIComponent(dirPath)}`
      ),
    enabled: !!projectId,
  });
}

export function useFileContent(projectId: string | null, filePath: string | null) {
  return useQuery({
    queryKey: ["file-content", projectId, filePath],
    queryFn: () =>
      apiClient.get<FileContent>(
        `/api/projects/${projectId}/file?path=${encodeURIComponent(filePath!)}`
      ),
    enabled: !!projectId && !!filePath,
  });
}
