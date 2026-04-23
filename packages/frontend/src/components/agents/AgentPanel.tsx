import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentCard } from "./AgentCard";
import { useAgents } from "@/api/queries/agents";

export function AgentPanel() {
  const { data: agents, isLoading } = useAgents();

  const busyAgents = agents?.filter((a) => a.status === "busy") ?? [];
  const idleAgents = agents?.filter((a) => a.status === "idle") ?? [];
  const errorAgents = agents?.filter((a) => a.status === "error") ?? [];
  const pausedAgents = agents?.filter((a) => a.status === "paused") ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700">Agents</h2>
        {agents && (
          <p className="text-xs text-gray-400 mt-0.5">
            {busyAgents.length} active · {idleAgents.length} idle
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 flex flex-col gap-2">
          {isLoading && (
            <p className="text-sm text-gray-400 text-center py-4">
              Loading agents...
            </p>
          )}

          {errorAgents.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-red-600 px-1">
                Errors ({errorAgents.length})
              </span>
              {errorAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}

          {busyAgents.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 px-1">
                Active ({busyAgents.length})
              </span>
              {busyAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}

          {pausedAgents.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 px-1">
                Paused ({pausedAgents.length})
              </span>
              {pausedAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}

          {idleAgents.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-500 px-1">
                Idle ({idleAgents.length})
              </span>
              {idleAgents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}

          {agents?.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No agents registered.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
