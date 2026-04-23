# LLD-008: Frontend Kanban UI

**References:** ADR-0007

## Overview

React + TypeScript frontend with a Kanban board, task detail views, agent panels, communication feed, and operator controls. Uses Zustand for UI state, TanStack Query for server state, shadcn/ui for components, and dnd-kit for drag-and-drop.

## File Structure

```
packages/frontend/src/
  main.tsx                    # App entry
  App.tsx                     # Root layout and routing
  api/
    client.ts                 # Fetch wrapper for REST API
    queries/
      tasks.ts                # TanStack Query hooks for tasks
      agents.ts               # TanStack Query hooks for agents
      messages.ts             # TanStack Query hooks for messages
      memories.ts             # TanStack Query hooks for memories
      stats.ts                # TanStack Query hooks for stats
  hooks/
    use-sse.ts                # SSE connection and cache invalidation
    use-board.ts              # Board-specific state and drag logic
  stores/
    ui-store.ts               # Zustand store for UI state
  components/
    layout/
      Header.tsx              # Top bar with project selector
      Sidebar.tsx             # Agent panel sidebar
    board/
      KanbanBoard.tsx         # Main board with all columns
      KanbanColumn.tsx        # Single column (collapsible)
      TaskCard.tsx             # Draggable task card
      ColumnHeader.tsx         # Column title, count, collapse toggle
    task/
      TaskDetail.tsx           # Full task detail sheet/drawer
      TaskHistory.tsx          # Timeline of task events
      HandoffViewer.tsx        # Rendered handoff markdown
      DeliverableList.tsx      # List of task deliverables
      QualityGateStatus.tsx    # Quality gate results display
    agents/
      AgentPanel.tsx           # List of agents with status
      AgentCard.tsx            # Individual agent status card
      AgentDetail.tsx          # Agent detail with memory viewer
      MemoryViewer.tsx         # Agent memory list with edit/delete
    messages/
      CommunicationFeed.tsx    # All inter-agent messages, threaded
      MessageThread.tsx        # Single clarification thread
      MessageBubble.tsx        # Individual message bubble
      OperatorMessageInput.tsx # Input for operator to message agents
    help/
      HelpWidget.tsx           # Floating help chat button + panel
      HelpPanel.tsx            # Chat panel with RAG responses
    common/
      PriorityBadge.tsx        # P0-P4 colored badges
      StageBadge.tsx           # Stage indicator
      AgentAvatar.tsx          # Agent role icon/avatar
      TimeInStage.tsx          # Time elapsed display
  lib/
    sse-query-contract.ts      # SSE event → TanStack Query key mapping
  pages/
    BoardPage.tsx              # Main Kanban board page
    StatsPage.tsx              # Cost and pipeline metrics
```

## Router Setup

```typescript
// App.tsx

import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <Header />
        <div className="flex h-[calc(100vh-3.5rem)]">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<BoardPage />} />
              <Route path="/stats" element={<StatsPage />} />
            </Routes>
          </main>
        </div>
        <HelpWidget />
      </QueryClientProvider>
    </BrowserRouter>
  );
}
```

## SSE Hook

```typescript
// hooks/use-sse.ts

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SSE_QUERY_MAP } from '../lib/sse-query-contract';

export function useSSE() {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    eventSourceRef.current = es;

    // Handle named events
    for (const [eventName, getQueryKeys] of Object.entries(SSE_QUERY_MAP)) {
      es.addEventListener(eventName, (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        const queryKeys = getQueryKeys(data);
        for (const key of queryKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      });
    }

    // Handle full-sync (reconnect after buffer overflow)
    es.addEventListener('full-sync', () => {
      queryClient.invalidateQueries(); // Invalidate everything
    });

    es.onerror = () => {
      // EventSource auto-reconnects with Last-Event-ID
    };

    return () => {
      es.close();
    };
  }, [queryClient]);
}
```

## SSE-Query Contract

```typescript
// lib/sse-query-contract.ts

type QueryKeyFn = (data: any) => (string | string[])[][];

export const SSE_QUERY_MAP: Record<string, QueryKeyFn> = {
  'task-updated': (data) => [
    ['tasks', data.taskId],
    ['board', data.projectId ?? 'all'],
  ],
  'agent-status': (data) => [
    ['agents'],
    ['agents', data.agentId],
  ],
  'new-message': (data) => [
    ['messages', data.taskId],
    ['messages', 'pending'],
  ],
  'message-response': (data) => [
    ['messages', data.taskId],
    ['messages', 'pending'],
  ],
  'handoff': (data) => [
    ['tasks', data.taskId],
    ['handoffs', data.taskId],
    ['board', data.projectId ?? 'all'],
  ],
  'quality-gate': (data) => [
    ['tasks', data.taskId],
  ],
  'defect-created': (data) => [
    ['board', data.projectId ?? 'all'],
  ],
  'agent-error': (data) => [
    ['agents'],
    ['agents', data.agentId],
  ],
};
```

## useBoard Hook

```typescript
// hooks/use-board.ts

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export function useBoard(projectId: string) {
  return useQuery({
    queryKey: ['board', projectId],
    queryFn: () => apiClient.get<Record<string, Task[]>>(`/api/projects/${projectId}/board`),
    refetchOnWindowFocus: true,
  });
}
```

## moveTask Mutation

```typescript
// api/queries/tasks.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../client';

export function useMoveTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, stage }: { taskId: string; stage: string }) =>
      apiClient.post(`/api/tasks/${taskId}/move`, { stage }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.taskId] });
    },
  });
}
```

## Kanban Board

```typescript
// components/board/KanbanBoard.tsx

import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useUIStore } from '../../stores/ui-store';

const STAGES = [
  'todo', 'product', 'architecture', 'development',
  'tech_lead_review', 'devops_build', 'manual_qa',
  'automation', 'documentation', 'devops_deploy',
  'arch_review', 'done',
];

// Visual grouping per ADR-0007
const STAGE_GROUPS: Record<string, string[]> = {
  'Build': ['todo', 'product', 'architecture', 'development'],
  'QA': ['tech_lead_review', 'manual_qa', 'automation'],
  'Deploy': ['devops_build', 'documentation', 'devops_deploy', 'arch_review', 'done'],
};

function KanbanBoard({ projectId }: { projectId: string }) {
  const { data: board } = useBoard(projectId);
  const moveTask = useMoveTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const [compactMode, setCompactMode] = useState(false);
  const activeFilters = useUIStore((s) => s.activeFilters);

  // Auto-collapse empty columns — merge with existing collapsed state
  // instead of replacing it, so manually collapsed columns stay collapsed
  useEffect(() => {
    if (!board) return;
    const empty = STAGES.filter(s => (board[s] ?? []).length === 0);
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      for (const s of empty) next.add(s);
      return next;
    });
  }, [board]);

  // Apply activeFilters from Zustand store (focus view)
  const filteredBoard = useMemo(() => {
    if (!board) return board;
    const result: Record<string, Task[]> = {};
    for (const stage of STAGES) {
      let tasks = board[stage] ?? [];
      if (activeFilters.agents.length > 0) {
        tasks = tasks.filter(t => t.assignedAgent && activeFilters.agents.includes(t.assignedAgent));
      }
      if (activeFilters.priorities.length > 0) {
        tasks = tasks.filter(t => activeFilters.priorities.includes(t.priority));
      }
      if (activeFilters.types.length > 0) {
        tasks = tasks.filter(t => activeFilters.types.includes(t.type));
      }
      result[stage] = tasks;
    }
    return result;
  }, [board, activeFilters]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = findTask(filteredBoard, event.active.id);
    setActiveTask(task);
    useUIStore.getState().setDragging(true);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    useUIStore.getState().setDragging(false);

    // After drag ends, apply any queued SSE events (see SSE event queuing below)
    useUIStore.getState().flushDragQueue();

    if (!event.over) return;

    const taskId = event.active.id as string;
    const targetStage = event.over.id as string;

    // REST mutation
    await moveTask.mutateAsync({ taskId, stage: targetStage });
  };

  const toggleCollapse = (stage: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  return (
    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory h-full p-4">
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {Object.entries(STAGE_GROUPS).map(([groupName, stages]) => (
          <div key={groupName} className="flex gap-2">
            {/* Visual separator between stage groups */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                {groupName}
              </span>
              <div className="flex gap-2">
                {stages.map(stage => (
                  <KanbanColumn
                    key={stage}
                    stage={stage}
                    tasks={filteredBoard?.[stage] ?? []}
                    collapsed={collapsedColumns.has(stage)}
                    compact={compactMode}
                    onToggleCollapse={() => toggleCollapse(stage)}
                  />
                ))}
              </div>
            </div>
            <div className="w-px bg-border mx-1" /> {/* Group divider */}
          </div>
        ))}

        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
```

### KanbanColumn with useDroppable

```typescript
// components/board/KanbanColumn.tsx

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

function KanbanColumn({ stage, tasks, collapsed, compact, onToggleCollapse }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  if (collapsed) {
    return (
      <div className="w-10 cursor-pointer" onClick={onToggleCollapse}>
        <ColumnHeader stage={stage} count={tasks.length} collapsed />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn("w-72 flex flex-col", isOver && "ring-2 ring-primary/50 rounded")}
    >
      <ColumnHeader stage={stage} count={tasks.length} onToggle={onToggleCollapse} />
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto">
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} compact={compact} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
```

## Task Card

```typescript
// components/board/TaskCard.tsx

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Wrapper that connects to dnd-kit's sortable system
function SortableTaskCard({ task, compact }: { task: Task; compact: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} compact={compact} isDragging={isDragging} />
    </div>
  );
}

function TaskCard({ task, compact, isDragging }: TaskCardProps) {
  if (compact) {
    return (
      <div className={cn(
        "p-2 rounded border bg-card flex items-center gap-2",
        isDragging && "opacity-50"
      )}>
        <PriorityBadge priority={task.priority} />
        <span className="text-sm truncate flex-1">{task.title}</span>
        {task.type === 'bug' && <Badge variant="destructive">Bug</Badge>}
      </div>
    );
  }

  return (
    <Card className={cn("p-3 cursor-grab", isDragging && "opacity-50")}>
      <div className="flex items-center justify-between mb-1">
        <PriorityBadge priority={task.priority} />
        {task.type === 'bug' && <Badge variant="destructive">Bug</Badge>}
      </div>
      <h4 className="text-sm font-medium mb-2">{task.title}</h4>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {task.assignedAgent && <AgentAvatar agentId={task.assignedAgent} size="sm" />}
        <TimeInStage updatedAt={task.updatedAt} />
      </div>
      {task.beadsId && (
        <span className="text-xs text-muted-foreground">{task.beadsId}</span>
      )}
    </Card>
  );
}
```

## Zustand UI Store

```typescript
// stores/ui-store.ts

import { create } from 'zustand';

interface SSEQueuedEvent {
  eventName: string;
  data: any;
}

interface UIState {
  selectedProject: string | null;
  selectedTask: string | null;
  sidebarOpen: boolean;
  compactMode: boolean;
  isDragging: boolean;
  draggedTaskId: string | null;
  dragEventQueue: SSEQueuedEvent[];
  activeFilters: {
    agents: string[];
    priorities: string[];
    types: string[];
  };

  // Actions
  setSelectedProject: (id: string | null) => void;
  setSelectedTask: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleCompactMode: () => void;
  setDragging: (v: boolean, taskId?: string | null) => void;
  setFilter: (key: string, values: string[]) => void;
  // SSE event queuing during drag (ADR-0007 requirement):
  // When isDragging is true, incoming task-updated events for the dragged task
  // are queued instead of applied immediately. This prevents the board from
  // re-rendering under the user's cursor mid-drag.
  queueDragEvent: (event: SSEQueuedEvent) => void;
  flushDragQueue: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  selectedProject: null,
  selectedTask: null,
  sidebarOpen: true,
  compactMode: false,
  isDragging: false,
  draggedTaskId: null,
  dragEventQueue: [],
  activeFilters: { agents: [], priorities: [], types: [] },

  setSelectedProject: (id) => set({ selectedProject: id }),
  setSelectedTask: (id) => set({ selectedTask: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
  setDragging: (v, taskId = null) => set({ isDragging: v, draggedTaskId: v ? taskId : null }),
  setFilter: (key, values) => set((s) => ({
    activeFilters: { ...s.activeFilters, [key]: values }
  })),
  queueDragEvent: (event) => set((s) => ({
    dragEventQueue: [...s.dragEventQueue, event],
  })),
  flushDragQueue: () => {
    const queue = get().dragEventQueue;
    set({ dragEventQueue: [] });
    // Caller (KanbanBoard handleDragEnd) should replay queued events
    // by invalidating the relevant TanStack Query keys after this call.
    return queue;
  },
}));
```

## Communication Feed

```typescript
// components/messages/CommunicationFeed.tsx

function CommunicationFeed({ taskId }: { taskId?: string }) {
  const { data: messages } = useMessages(taskId);
  const [filterType, setFilterType] = useState<string | null>(null);

  const filtered = filterType
    ? messages?.filter(m => m.type === filterType)
    : messages;

  // Group into threads (clarification + response pairs)
  const threads = groupIntoThreads(filtered ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {['all', 'clarification', 'rejection', 'notification'].map(type => (
          <Button
            key={type}
            variant={filterType === type || (type === 'all' && !filterType) ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType(type === 'all' ? null : type)}
          >
            {type}
          </Button>
        ))}
      </div>

      {threads.map(thread => (
        <MessageThread key={thread.id} thread={thread} />
      ))}

      {/* Highlight unresolved clarifications — filter out any that already
          appear inside a rendered thread to avoid duplicate rendering */}
      {messages
        ?.filter(m => m.status === 'pending')
        .filter(m => !threads.some(t => t.messages.some(tm => tm.id === m.id)))
        .map(m => (
          <div key={m.id} className="border-l-4 border-yellow-500 pl-3 bg-yellow-50 rounded p-2">
            <span className="text-xs font-medium text-yellow-700">Waiting for response</span>
            <MessageBubble message={m} />
          </div>
        ))}
    </div>
  );
}
```
