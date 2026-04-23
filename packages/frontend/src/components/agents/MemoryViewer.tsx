import { useState } from "react";
import { useAgentMemories, useDeleteMemory } from "@/api/queries/memories";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface MemoryViewerProps {
  agentId: string;
}

export function MemoryViewer({ agentId }: MemoryViewerProps) {
  const { data: memories, isLoading } = useAgentMemories(agentId);
  const deleteMutation = useDeleteMemory();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-xs text-gray-400 py-1">Loading memories...</p>;
  }

  if (!memories || memories.length === 0) {
    return <p className="text-xs text-gray-400 py-1">No memories stored.</p>;
  }

  return (
    <div className="space-y-1">
      {memories.map((mem) => (
        <div
          key={mem.id}
          className="border border-gray-100 rounded px-2 py-1.5 text-xs"
        >
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() =>
              setExpandedId(expandedId === mem.id ? null : mem.id)
            }
          >
            <span className="font-medium text-gray-700 truncate">
              {mem.key || mem.title}
            </span>
            <span className="text-gray-400 text-[10px] ml-2 flex-shrink-0">
              {new Date(mem.updatedAt).toLocaleDateString()}
            </span>
          </div>
          {expandedId === mem.id && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-100">
              <p className="text-gray-600 whitespace-pre-wrap break-words">
                {mem.value || mem.content}
              </p>
              <div className="mt-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-5 text-red-500 hover:text-red-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate({ agentId, memoryId: mem.id });
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <X className="w-3 h-3 mr-0.5" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
