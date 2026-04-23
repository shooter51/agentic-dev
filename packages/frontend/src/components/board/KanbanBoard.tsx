import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { useFilteredBoard, STAGE_GROUPS, findTask } from "@/hooks/use-board";
import { useMoveTask } from "@/api/queries/tasks";
import { useUIStore } from "@/stores/ui-store";
import { SSE_QUERY_MAP } from "@/lib/sse-query-contract";
import type { Task } from "@/api/types";

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const { data: filteredBoard } = useFilteredBoard(projectId);
  const moveTask = useMoveTask();
  const queryClient = useQueryClient();

  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const compactMode = useUIStore((s) => s.compactMode);
  const setCollapsedColumns = useUIStore((s) => s.setCollapsedColumns);
  const collapsedColumns = useUIStore((s) => s.collapsedColumns);
  const toggleCollapsedColumn = useUIStore((s) => s.toggleCollapsedColumn);

  // Auto-collapse empty columns — merge with existing collapsed state
  // so manually collapsed columns stay collapsed
  useEffect(() => {
    if (!filteredBoard) return;
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      for (const [stage, tasks] of Object.entries(filteredBoard)) {
        if (tasks.length === 0) next.add(stage);
      }
      return next;
    });
  }, [filteredBoard, setCollapsedColumns]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(filteredBoard, event.active.id);
    setActiveTask(task);
    useUIStore.getState().setDragging(true, String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    useUIStore.getState().setDragging(false);

    // Replay queued SSE events now that drag is done
    const queue = useUIStore.getState().flushDragQueue();
    for (const { eventName, data } of queue) {
      const getQueryKeys = SSE_QUERY_MAP[eventName];
      if (getQueryKeys) {
        const keys = getQueryKeys(data);
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
    }

    if (!event.over) return;

    const taskId = String(event.active.id);
    const targetStage = String(event.over.id);

    await moveTask.mutateAsync({ taskId, stage: targetStage });
  };

  return (
    <div className="flex gap-0 overflow-x-auto h-full p-4 snap-x snap-mandatory">
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3">
          {Object.entries(STAGE_GROUPS).map(([groupName, stages], groupIdx) => (
            <div key={groupName} className="flex gap-3 items-start">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
                  {groupName}
                </span>
                <div className="flex gap-2">
                  {stages.map((stage) => (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      tasks={filteredBoard?.[stage] ?? []}
                      collapsed={collapsedColumns.has(stage)}
                      compact={compactMode}
                      onToggleCollapse={() => toggleCollapsedColumn(stage)}
                    />
                  ))}
                </div>
              </div>
              {groupIdx < Object.keys(STAGE_GROUPS).length - 1 && (
                <div className="w-px self-stretch bg-gray-200 mx-1 mt-5" />
              )}
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
