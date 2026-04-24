import { STAGES } from "@/hooks/use-board";
import { cn } from "@/lib/utils";

interface PipelineProgressProps {
  currentStage: string;
  compact?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  todo: "Todo",
  product: "Product",
  architecture: "Arch",
  development: "Dev",
  tech_lead_review: "TL Review",
  devops_build: "Build",
  manual_qa: "QA",
  automation: "Auto",
  documentation: "Docs",
  devops_deploy: "Deploy",
  arch_review: "Arch Rev",
  done: "Done",
};

export function PipelineProgress({ currentStage, compact = false }: PipelineProgressProps) {
  const currentIndex = STAGES.indexOf(currentStage as typeof STAGES[number]);
  const total = STAGES.length;
  const percentage = currentIndex === -1 ? 0 : Math.round(((currentIndex + 1) / total) * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">{percentage}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Stage {currentIndex === -1 ? "?" : currentIndex + 1} of {total}
        </span>
        <span className="text-xs font-medium text-gray-700">{percentage}%</span>
      </div>
      <div className="flex gap-0.5">
        {STAGES.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div
              key={stage}
              title={STAGE_LABELS[stage] ?? stage}
              className={cn(
                "h-2 flex-1 rounded-sm transition-colors",
                isCompleted && "bg-blue-500",
                isCurrent && "bg-blue-700",
                !isCompleted && !isCurrent && "bg-gray-100"
              )}
            />
          );
        })}
      </div>
      <div className="flex gap-0.5">
        {STAGES.map((stage, index) => {
          const isCurrent = index === currentIndex;
          return isCurrent ? (
            <div key={stage} className="flex-1 text-center">
              <span className="text-[10px] text-blue-700 font-medium leading-none">
                {STAGE_LABELS[stage] ?? stage}
              </span>
            </div>
          ) : (
            <div key={stage} className="flex-1" />
          );
        })}
      </div>
    </div>
  );
}
