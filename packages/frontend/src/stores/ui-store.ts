import { create } from "zustand";

interface SSEQueuedEvent {
  eventName: string;
  data: unknown;
}

interface ActiveFilters {
  agents: string[];
  priorities: string[];
  types: string[];
}

interface UIState {
  selectedProject: string | null;
  selectedTask: string | null;
  selectedAgent: string | null;
  sidebarOpen: boolean;
  compactMode: boolean;
  isDragging: boolean;
  draggedTaskId: string | null;
  dragEventQueue: SSEQueuedEvent[];
  activeFilters: ActiveFilters;
  collapsedColumns: Set<string>;

  // Actions
  setSelectedProject: (id: string | null) => void;
  setSelectedTask: (id: string | null) => void;
  setSelectedAgent: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleCompactMode: () => void;
  setDragging: (v: boolean, taskId?: string | null) => void;
  setFilter: (key: keyof ActiveFilters, values: string[]) => void;
  queueDragEvent: (event: SSEQueuedEvent) => void;
  flushDragQueue: () => SSEQueuedEvent[];
  toggleCollapsedColumn: (stage: string) => void;
  setCollapsedColumns: (updater: (prev: Set<string>) => Set<string>) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  selectedProject: null,
  selectedTask: null,
  selectedAgent: null,
  sidebarOpen: true,
  compactMode: false,
  isDragging: false,
  draggedTaskId: null,
  dragEventQueue: [],
  activeFilters: { agents: [], priorities: [], types: [] },
  collapsedColumns: new Set<string>(),

  setSelectedProject: (id) => set({ selectedProject: id }),
  setSelectedTask: (id) => set({ selectedTask: id }),
  setSelectedAgent: (id) => set({ selectedAgent: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
  setDragging: (v, taskId = null) =>
    set({ isDragging: v, draggedTaskId: v ? taskId : null }),
  setFilter: (key, values) =>
    set((s) => ({
      activeFilters: { ...s.activeFilters, [key]: values },
    })),
  queueDragEvent: (event) =>
    set((s) => ({
      dragEventQueue: [...s.dragEventQueue, event],
    })),
  flushDragQueue: () => {
    const queue = get().dragEventQueue;
    set({ dragEventQueue: [] });
    return queue;
  },
  toggleCollapsedColumn: (stage) =>
    set((s) => {
      const next = new Set(s.collapsedColumns);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return { collapsedColumns: next };
    }),
  setCollapsedColumns: (updater) =>
    set((s) => ({ collapsedColumns: updater(s.collapsedColumns) })),
}));
