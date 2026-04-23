import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { MarkdownContent } from "@/components/common/MarkdownContent";
import { StageBadge } from "@/components/common/StageBadge";
import { MemoryViewer } from "./MemoryViewer";
import { useAgent } from "@/api/queries/agents";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AgentDetailProps {
  agentId: string | null;
  onClose: () => void;
}

interface Handoff {
  id: string;
  taskId: string;
  fromStage: string;
  toStage: string;
  fromAgent: string;
  content: string;
  createdAt: string;
}

function useAgentHandoffs(agentId: string | null) {
  return useQuery({
    queryKey: ["agent-handoffs", agentId],
    queryFn: () => apiClient.get<Handoff[]>(`/api/agents/${agentId}/handoffs`),
    enabled: !!agentId,
  });
}

function HandoffItem({ handoff }: { handoff: Handoff }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg text-sm overflow-hidden">
      <button
        className="w-full flex items-center gap-2 p-3 hover:bg-gray-50 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <AgentAvatar agentId={handoff.fromAgent} size="sm" />
        <StageBadge stage={handoff.fromStage} />
        <span className="text-gray-400">&rarr;</span>
        <StageBadge stage={handoff.toStage} />
        <span className="text-xs text-gray-400 ml-auto">
          {new Date(handoff.createdAt).toLocaleString()}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          <MarkdownContent content={handoff.content} className="max-h-64 overflow-y-auto" />
        </div>
      )}
    </div>
  );
}

export function AgentDetail({ agentId, onClose }: AgentDetailProps) {
  const { data: agent } = useAgent(agentId ?? "");
  const { data: handoffs, isLoading: handoffsLoading } = useAgentHandoffs(agentId);

  return (
    <Sheet open={!!agentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {agent && <AgentAvatar agentId={agent.id} role={agent.role} size="md" />}
            <div>
              <SheetTitle className="text-left">
                {agent?.name ?? "Agent Detail"}
              </SheetTitle>
              {agent && (
                <p className="text-xs text-gray-500 mt-0.5">{agent.role}</p>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {agent && (
            <Tabs defaultValue="overview" className="flex-1 flex flex-col">
              <TabsList className="mx-6 mt-4 self-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="output">Session Output</TabsTrigger>
                <TabsTrigger value="memories">Memories</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="flex-1 px-6 py-4 overflow-y-auto">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Status
                      </label>
                      <p className="text-sm text-gray-800 mt-1 capitalize">{agent.status}</p>
                    </div>
                    {(agent as any).model && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Model
                        </label>
                        <p className="text-sm text-gray-800 mt-1">{(agent as any).model}</p>
                      </div>
                    )}
                  </div>

                  {agent.currentTaskId && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Current Task
                      </label>
                      <p className="text-sm text-gray-800 mt-1 font-mono">{agent.currentTaskId}</p>
                    </div>
                  )}

                  {(agent as any).specialization && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Specialization
                      </label>
                      <p className="text-sm text-gray-800 mt-1">{(agent as any).specialization}</p>
                    </div>
                  )}

                  {agent.status === "error" && (agent as any).lastError && (
                    <div>
                      <label className="text-xs font-medium text-red-500 uppercase tracking-wide">
                        Last Error
                      </label>
                      <p className="text-sm text-red-700 mt-1 bg-red-50 rounded p-2">
                        {(agent as any).lastError}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="output" className="flex-1 px-6 py-4 overflow-y-auto">
                {handoffsLoading ? (
                  <p className="text-xs text-gray-400">Loading handoffs...</p>
                ) : !handoffs || handoffs.length === 0 ? (
                  <p className="text-xs text-gray-400">No handoffs created by this agent.</p>
                ) : (
                  <div className="space-y-2">
                    {handoffs.map((h) => (
                      <HandoffItem key={h.id} handoff={h} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="memories" className="flex-1 px-6 py-4 overflow-y-auto">
                <MemoryViewer agentId={agent.id} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
