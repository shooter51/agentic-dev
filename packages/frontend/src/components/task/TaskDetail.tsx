import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/common/PriorityBadge";
import { StageBadge } from "@/components/common/StageBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { PipelineProgress } from "@/components/common/PipelineProgress";
import { MarkdownContent } from "@/components/common/MarkdownContent";
import { TaskHistory } from "./TaskHistory";
import { QualityGateStatus } from "./QualityGateStatus";
import { HandoffViewer } from "./HandoffViewer";
import { DeliverableList } from "./DeliverableList";
import { CommunicationFeed } from "@/components/messages/CommunicationFeed";
import { TaskEditor } from "./TaskEditor";
import { useTask, useMoveTask, useApproveTask } from "@/api/queries/tasks";
import { useAgentModel } from "@/api/queries/agents";
import { useUIStore } from "@/stores/ui-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { RefreshCw, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TaskDetail() {
  const selectedTask = useUIStore((s) => s.selectedTask);
  const setSelectedTask = useUIStore((s) => s.setSelectedTask);
  const { data: task, isLoading } = useTask(selectedTask ?? "");
  const agentModel = useAgentModel(task?.assignedAgent);

  const isOpen = !!selectedTask;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && setSelectedTask(null)}>
      <SheetContent className="w-[520px] sm:max-w-[520px] flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            {task && <PriorityBadge priority={task.priority} />}
            {task && <StageBadge stage={task.stage} />}
            {task?.type === "bug" && (
              <Badge variant="destructive">Bug</Badge>
            )}
          </div>
          <SheetTitle className="text-left mt-1">
            {isLoading ? "Loading..." : (task?.title ?? "Task Detail")}
          </SheetTitle>
          {task?.beadsId && (
            <p className="text-xs text-gray-400">{task.beadsId}</p>
          )}
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {task && (
            <Tabs defaultValue="details" className="flex-1 min-h-0 flex flex-col">
              <TabsList className="mx-6 mt-4 self-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
              </TabsList>

              <TabsContent
                value="details"
                className="flex-1 px-6 py-4 overflow-y-auto"
              >
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Pipeline Progress
                    </label>
                    <div className="mt-2">
                      <PipelineProgress currentStage={task.stage} />
                    </div>
                  </div>

                  {task.awaitingApproval && (
                    <ApprovalBanner taskId={task.id} stage={task.awaitingApproval} />
                  )}

                  {task.stage !== "done" && task.stage !== "todo" && (
                    <TaskActions taskId={task.id} stage={task.stage} />
                  )}

                  {task.assignedAgent && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Assigned Agent
                      </label>
                      <button
                        className="flex items-center gap-2 mt-1 hover:bg-gray-50 rounded p-1 -ml-1 transition-colors"
                        onClick={() => {
                          setSelectedTask(null);
                          setTimeout(() => useUIStore.getState().setSelectedAgent(task.assignedAgent!), 100);
                        }}
                      >
                        <AgentAvatar agentId={task.assignedAgent} model={agentModel} size="md" />
                        <span className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
                          {task.assignedAgent}
                        </span>
                      </button>
                    </div>
                  )}

                  {task.description && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Description
                      </label>
                      <div className="mt-1">
                        <MarkdownContent content={task.description} />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Created
                      </label>
                      <p className="text-sm text-gray-700 mt-1">
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Updated
                      </label>
                      <p className="text-sm text-gray-700 mt-1">
                        {new Date(task.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Edit (only for todo/product stages) */}
                  <TaskEditor task={task} />

                  {/* Quality Gates */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Quality Gates
                    </label>
                    <div className="mt-2">
                      <QualityGateStatus metadata={(task as any).metadata ?? null} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="history"
                className="flex-1 px-6 py-4 overflow-y-auto"
              >
                <TaskHistory taskId={task.id} />
              </TabsContent>

              <TabsContent
                value="messages"
                className="flex-1 px-6 py-4 overflow-y-auto"
              >
                <CommunicationFeed taskId={task.id} />
              </TabsContent>

              <TabsContent
                value="artifacts"
                className="flex-1 px-6 py-4 overflow-y-auto"
              >
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Handoffs
                    </h3>
                    <HandoffViewer taskId={task.id} />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Deliverables
                    </h3>
                    <DeliverableList taskId={task.id} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TaskActions({ taskId, stage }: { taskId: string; stage: string }) {
  const queryClient = useQueryClient();

  const retry = useMutation({
    mutationFn: () => apiClient.post(`/api/tasks/${taskId}/retry`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-history", taskId] });
    },
  });

  const cancel = useMutation({
    mutationFn: () => apiClient.post(`/api/tasks/${taskId}/cancel`, { reason: "Cancelled by operator" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
    },
  });

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        className="gap-1 text-xs"
        onClick={() => retry.mutate()}
        disabled={retry.isPending}
      >
        <RefreshCw className="w-3 h-3" />
        {retry.isPending ? "Retrying..." : "Reset & Retry"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
        onClick={() => cancel.mutate()}
        disabled={cancel.isPending}
      >
        <Trash2 className="w-3 h-3" />
        Cancel
      </Button>
    </div>
  );
}

const STAGE_LABELS: Record<string, string> = {
  product: "Product", architecture: "Architecture", development: "Development",
  tech_lead_review: "Tech Lead Review", devops_build: "DevOps Build",
  manual_qa: "Manual QA", automation: "Automation", documentation: "Documentation",
  devops_deploy: "DevOps Deploy", arch_review: "Arch Review",
};

function ApprovalBanner({ taskId, stage }: { taskId: string; stage: string }) {
  const approve = useApproveTask();

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-amber-900">
            Awaiting your approval
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {STAGE_LABELS[stage] ?? stage} stage is complete. Review the work and approve to continue the pipeline.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => approve.mutate(taskId)}
          disabled={approve.isPending}
        >
          <UserCheck className="w-3.5 h-3.5" />
          {approve.isPending ? "Approving..." : "Approve & Continue"}
        </Button>
      </div>
    </div>
  );
}
