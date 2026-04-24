import { cn } from "@/lib/utils";
import { Bot, Code, TestTube, Layers, Rocket, FileText, Wrench } from "lucide-react";
import { getAgentColor, type AgentModel } from "@/theme/agent-colors";

/**
 * Icon mapping for different agent types.
 * Maps agentId patterns to appropriate icons.
 */
const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "product-manager": Layers,
  architect: Layers,
  "dev-1": Code,
  "dev-2": Code,
  "dev-3": Code,
  "tech-lead": Code,
  devops: Rocket,
  "manual-qa": TestTube,
  automation: Wrench,
  documentation: FileText,
  default: Bot,
};

interface AgentAvatarProps {
  agentId: string;
  role?: string;
  model?: AgentModel;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AgentAvatar({
  agentId,
  role,
  model,
  size = "md",
  className,
}: AgentAvatarProps) {
  // Get color tokens based on agentId and model strength
  const colorTokens = getAgentColor(agentId, model);

  // Get icon based on agentId, falling back to role inference for backward compatibility
  const Icon = AGENT_ICONS[agentId] ?? AGENT_ICONS[inferRoleFromId(agentId)] ?? AGENT_ICONS.default;

  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-7 h-7",
    lg: "w-9 h-9",
  };

  const iconSizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  // Create enhanced title with display name and agent ID
  const title = `${colorTokens.displayName} (${agentId})${model ? ` - ${model}` : ""}`;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        colorTokens.avatarClassName,
        sizeClasses[size],
        className
      )}
      title={title}
    >
      <Icon className={iconSizeClasses[size]} />
    </span>
  );
}

/**
 * Legacy role inference for backward compatibility.
 * Maps old role patterns to agent icons.
 */
function inferRoleFromId(agentId: string | null | undefined): string {
  if (!agentId) return "default";
  const lower = agentId.toLowerCase();
  if (lower.includes("product")) return "product-manager";
  if (lower.includes("arch")) return "architect";
  if (lower.includes("devops") || lower.includes("deploy")) return "devops";
  if (lower.includes("dev")) return "dev-1"; // Default to dev-1 icon
  if (lower.includes("tech")) return "tech-lead";
  if (lower.includes("qa") || lower.includes("test")) return "manual-qa";
  if (lower.includes("automat")) return "automation";
  if (lower.includes("doc")) return "documentation";
  return "default";
}
