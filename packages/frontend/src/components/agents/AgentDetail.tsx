import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { MarkdownContent } from "@/components/common/MarkdownContent";
import { StageBadge } from "@/components/common/StageBadge";
import { MemoryViewer } from "./MemoryViewer";
import { useAgent } from "@/api/queries/agents";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";

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

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-gray-100 text-gray-600",
  working: "bg-blue-100 text-blue-700",
  busy: "bg-blue-100 text-blue-700",
  error: "bg-red-100 text-red-700",
  paused: "bg-yellow-100 text-yellow-700",
};

function useAgentHandoffs(agentId: string | null) {
  return useQuery({
    queryKey: ["agent-handoffs", agentId],
    queryFn: () => apiClient.get<Handoff[]>(`/api/agents/${agentId}/handoffs`),
    enabled: !!agentId,
    refetchInterval: 5_000,
  });
}

function HandoffItem({ handoff }: { handoff: Handoff }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg text-sm overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        )}
        <StageBadge stage={handoff.fromStage} />
        <span className="text-gray-400">&rarr;</span>
        <StageBadge stage={handoff.toStage} />
        <span className="text-xs text-gray-400 ml-auto">
          {new Date(handoff.createdAt).toLocaleString()}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-gray-100 max-h-96 overflow-y-auto">
          <MarkdownContent content={handoff.content} />
        </div>
      )}
    </div>
  );
}

function LiveOutput({ agentId }: { agentId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: agent } = useAgent(agentId);

  // Poll for live tool call events via SSE
  useEffect(() => {
    if (!agentId) return;

    const es = new EventSource("/api/events");

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.agentId === agentId) {
          const ts = new Date().toLocaleTimeString();
          setLines((prev) => [...prev.slice(-100), `[${ts}] Tool: ${data.tool}`]);
        }
      } catch { /* ignore */ }
    };

    es.addEventListener("agent-tool-call", handler);

    return () => {
      es.removeEventListener("agent-tool-call", handler);
      es.close();
    };
  }, [agentId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines]);

  const isWorking = agent?.status === "working" || agent?.status === "busy";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isWorking && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Radio className="w-3 h-3 animate-pulse" />
            Live
          </span>
        )}
        {!isWorking && lines.length === 0 && (
          <span className="text-xs text-gray-400">Agent is idle. Output appears when working.</span>
        )}
      </div>
      {lines.length > 0 && (
        <div
          ref={scrollRef}
          className="bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg max-h-48 overflow-y-auto"
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
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
      <SheetContent className="w-[520px] sm:max-w-[520px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {agentId && <AgentAvatar agentId={agentId} role={agent?.role} size="lg" />}
            <div className="flex-1">
              <SheetTitle className="text-left">{agent?.name || agentId}</SheetTitle>
              <p className="text-xs text-gray-500">{agent?.role}</p>
            </div>
            <Badge className={cn("text-xs", STATUS_COLORS[agent?.status ?? "idle"])}>
              {agent?.status}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <Tabs defaultValue="live" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="mx-6 mt-4 self-start">
              <TabsTrigger value="live">Live Output</TabsTrigger>
              <TabsTrigger value="handoffs">Handoffs</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="memories">Memories</TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="flex-1 min-h-0 px-6 py-4 overflow-y-auto">
              {agentId && <LiveOutput agentId={agentId} />}
              {/* Also show the most recent handoff as the latest completed output */}
              {handoffs && handoffs.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Latest Completed Output
                  </p>
                  <HandoffItem handoff={handoffs[handoffs.length - 1]} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="handoffs" className="flex-1 min-h-0 px-6 py-4 overflow-y-auto">
              {handoffsLoading ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : !handoffs || handoffs.length === 0 ? (
                <p className="text-xs text-gray-400">No handoffs yet.</p>
              ) : (
                <div className="space-y-2">
                  {handoffs.map((h) => (
                    <HandoffItem key={h.id} handoff={h} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="overview" className="flex-1 min-h-0 px-6 py-4 overflow-y-auto">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Model</label>
                    <p className="text-sm text-gray-800 mt-1">
                      {agent?.model === "opus" ? "Claude Opus" : "Claude Sonnet"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</label>
                    <p className="text-sm text-gray-800 mt-1 capitalize">{agent?.status}</p>
                  </div>
                </div>
                {agent?.currentTask && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Current Task</label>
                    <p className="text-sm text-blue-600 mt-1">{agent.currentTask}</p>
                  </div>
                )}
                {agent?.lastError && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Error</label>
                    <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-mono whitespace-pre-wrap">
                      {agent.lastError}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="memories" className="flex-1 min-h-0 px-6 py-4 overflow-y-auto">
              {agentId && <MemoryViewer agentId={agentId} />}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
