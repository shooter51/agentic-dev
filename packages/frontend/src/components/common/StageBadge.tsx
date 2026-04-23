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

interface StageBadgeProps {
  stage: string;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  const label = STAGE_LABELS[stage] ?? stage;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200",
        className
      )}
    >
      {label}
    </span>
  );
}
