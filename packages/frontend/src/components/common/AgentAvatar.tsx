import { cn } from "@/lib/utils";
import { Bot, Code, TestTube, Layers, Rocket } from "lucide-react";

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  product: Layers,
  architect: Layers,
  developer: Code,
  tech_lead: Code,
  qa: TestTube,
  devops: Rocket,
  default: Bot,
};

const ROLE_COLORS: Record<string, string> = {
  product: "bg-purple-100 text-purple-600",
  architect: "bg-blue-100 text-blue-600",
  developer: "bg-green-100 text-green-600",
  tech_lead: "bg-cyan-100 text-cyan-600",
  qa: "bg-yellow-100 text-yellow-600",
  devops: "bg-orange-100 text-orange-600",
  default: "bg-gray-100 text-gray-600",
};

interface AgentAvatarProps {
  agentId: string;
  role?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AgentAvatar({
  agentId,
  role,
  size = "md",
  className,
}: AgentAvatarProps) {
  const inferredRole = role ?? inferRoleFromId(agentId);
  const Icon = ROLE_ICONS[inferredRole] ?? ROLE_ICONS.default;
  const colorClass = ROLE_COLORS[inferredRole] ?? ROLE_COLORS.default;

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

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        colorClass,
        sizeClasses[size],
        className
      )}
      title={agentId}
    >
      <Icon className={iconSizeClasses[size]} />
    </span>
  );
}

function inferRoleFromId(agentId: string): string {
  const lower = agentId.toLowerCase();
  if (lower.includes("product")) return "product";
  if (lower.includes("arch")) return "architect";
  if (lower.includes("dev")) return "developer";
  if (lower.includes("tech")) return "tech_lead";
  if (lower.includes("qa") || lower.includes("test")) return "qa";
  if (lower.includes("devops") || lower.includes("deploy")) return "devops";
  return "default";
}
