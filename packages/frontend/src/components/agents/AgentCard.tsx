import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { usePauseAgent, useResumeAgent } from "@/api/queries/agents";
import { cn } from "@/lib/utils";
import type { Agent } from "@/api/types";

const STATUS_BADGE: Record<
  Agent["status"],
  { label: string; className: string }
> = {
  idle: { label: "Idle", className: "bg-gray-100 text-gray-600" },
  busy: { label: "Busy", className: "bg-blue-100 text-blue-700" },
  error: { label: "Error", className: "bg-red-100 text-red-700" },
  paused: { label: "Paused", className: "bg-yellow-100 text-yellow-700" },
};

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const pause = usePauseAgent();
  const resume = useResumeAgent();

  const statusConfig = STATUS_BADGE[agent.status];

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
      <div className="relative flex-shrink-0">
        <AgentAvatar agentId={agent.id} role={agent.role} size="md" />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
            agent.status === "busy" && "bg-blue-500",
            agent.status === "idle" && "bg-green-500",
            agent.status === "error" && "bg-red-500",
            agent.status === "paused" && "bg-yellow-500"
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {agent.name}
          </span>
          <span
            className={cn(
              "text-xs px-1.5 py-0.5 rounded-full font-medium",
              statusConfig.className
            )}
          >
            {statusConfig.label}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{agent.role}</p>
        {agent.currentTaskId && (
          <p className="text-xs text-gray-400 mt-1 truncate">
            Working on: {agent.currentTaskId}
          </p>
        )}
      </div>

      <div className="flex-shrink-0">
        {agent.status === "paused" ? (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7"
            onClick={() => resume.mutate(agent.id)}
            disabled={resume.isPending}
          >
            Resume
          </Button>
        ) : agent.status !== "error" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7"
            onClick={() => pause.mutate(agent.id)}
            disabled={pause.isPending}
          >
            Pause
          </Button>
        ) : null}
      </div>
    </div>
  );
}
