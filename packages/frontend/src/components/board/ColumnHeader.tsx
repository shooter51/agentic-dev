import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  todo: "Todo",
  product: "Product",
  architecture: "Architecture",
  development: "Development",
  tech_lead_review: "TL Review",
  devops_build: "Build",
  manual_qa: "Manual QA",
  automation: "Automation",
  documentation: "Docs",
  devops_deploy: "Deploy",
  arch_review: "Arch Review",
  done: "Done",
};

interface ColumnHeaderProps {
  stage: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function ColumnHeader({
  stage,
  count,
  collapsed,
  onToggle,
}: ColumnHeaderProps) {
  const label = STAGE_LABELS[stage] ?? stage;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2 px-1">
        <ChevronRight className="w-3 h-3 text-gray-400" />
        <span
          className="text-xs font-medium text-gray-500 [writing-mode:vertical-rl] rotate-180"
          style={{ writingMode: "vertical-rl" }}
        >
          {label}
        </span>
        {count > 0 && (
          <span className="text-xs font-semibold text-gray-700 bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center">
            {count}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-2 cursor-pointer select-none",
        onToggle && "hover:bg-gray-50 rounded-t"
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-1.5 py-0.5">
          {count}
        </span>
      </div>
      {onToggle && <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
    </div>
  );
}
