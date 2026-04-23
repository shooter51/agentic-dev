import { cn } from "@/lib/utils";
import type { Priority } from "@/api/types";

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; className: string }
> = {
  P0: { label: "P0", className: "bg-red-600 text-white" },
  P1: { label: "P1", className: "bg-orange-500 text-white" },
  P2: { label: "P2", className: "bg-yellow-500 text-white" },
  P3: { label: "P3", className: "bg-blue-500 text-white" },
  P4: { label: "P4", className: "bg-gray-400 text-white" },
};

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.P4;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
