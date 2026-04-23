import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/common/PriorityBadge";
import { StageBadge } from "@/components/common/StageBadge";
import { AgentAvatar } from "@/components/common/AgentAvatar";
import { TaskHistory } from "./TaskHistory";
import { CommunicationFeed } from "@/components/messages/CommunicationFeed";
import { useTask } from "@/api/queries/tasks";
import { useUIStore } from "@/stores/ui-store";

export function TaskDetail() {
  const selectedTask = useUIStore((s) => s.selectedTask);
  const setSelectedTask = useUIStore((s) => s.setSelectedTask);
  const { data: task, isLoading } = useTask(selectedTask ?? "");

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

        <div className="flex-1 overflow-hidden flex flex-col">
          {task && (
            <Tabs defaultValue="details" className="flex-1 flex flex-col">
              <TabsList className="mx-6 mt-4 self-start">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
              </TabsList>

              <TabsContent
                value="details"
                className="flex-1 px-6 py-4 overflow-y-auto"
              >
                <div className="space-y-4">
                  {task.assignedAgent && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Assigned Agent
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <AgentAvatar agentId={task.assignedAgent} size="md" />
                        <span className="text-sm text-gray-800">
                          {task.assignedAgent}
                        </span>
                      </div>
                    </div>
                  )}

                  {task.description && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Description
                      </label>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                        {task.description}
                      </p>
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
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
