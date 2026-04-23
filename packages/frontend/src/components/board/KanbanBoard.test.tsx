import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { KanbanBoard } from "./KanbanBoard";
import { useUIStore } from "@/stores/ui-store";

// Capture DnD event handlers so we can call them in tests
let capturedOnDragStart: ((e: unknown) => void) | undefined;
let capturedOnDragEnd: ((e: unknown) => void) | undefined;

// Mock DnD kit — KanbanBoard uses DndContext, DragOverlay, useSensor, useSensors
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragStart, onDragEnd }: {
    children: React.ReactNode;
    onDragStart?: (e: unknown) => void;
    onDragEnd?: (e: unknown) => void;
  }) => {
    capturedOnDragStart = onDragStart;
    capturedOnDragEnd = onDragEnd;
    return (
      <div
        data-testid="dnd-context"
        data-onstartset={!!onDragStart}
        data-onendset={!!onDragEnd}
      >
        {children}
      </div>
    );
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCenter: {},
  PointerSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...args: unknown[]) => args),
  useDroppable: vi.fn(() => ({ setNodeRef: () => {}, isOver: false })),
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

// Stable board data reference to prevent infinite re-render in KanbanBoard's useEffect
const stableEmptyBoard = Object.freeze({
  todo: [],
  product: [],
  architecture: [],
  development: [],
  tech_lead_review: [],
  devops_build: [],
  manual_qa: [],
  automation: [],
  documentation: [],
  devops_deploy: [],
  arch_review: [],
  done: [],
});

// Mock the board query
vi.mock("@/hooks/use-board", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/use-board")>();
  return {
    ...original,
    useFilteredBoard: vi.fn(() => ({
      data: stableEmptyBoard,
      rawData: stableEmptyBoard,
      isLoading: false,
      isSuccess: true,
    })),
  };
});

vi.mock("@/api/queries/tasks", () => ({
  useMoveTask: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

function makeFetchOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  capturedOnDragStart = undefined;
  capturedOnDragEnd = undefined;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeFetchOk({})));
  useUIStore.setState({
    selectedProject: null,
    selectedTask: null,
    sidebarOpen: true,
    compactMode: false,
    isDragging: false,
    draggedTaskId: null,
    dragEventQueue: [],
    activeFilters: { agents: [], priorities: [], types: [] },
    collapsedColumns: new Set(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("KanbanBoard", () => {
  it("renders the DnD context", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("dnd-context")).toBeInTheDocument();
  });

  it("renders all stage group labels", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });
    // Group labels may appear multiple times (group heading + column header "Build"/"Deploy")
    expect(screen.getAllByText("Build").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("QA").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Deploy").length).toBeGreaterThanOrEqual(1);
  });

  it("renders KanbanColumn components for each stage", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });
    // At least the column headers should be rendered
    expect(screen.getByText("Todo")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders DragOverlay", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("drag-overlay")).toBeInTheDocument();
  });

  it("renders group separators between stage groups", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });
    // Separator divs between groups (w-px divs)
    const separators = container.querySelectorAll(".w-px");
    expect(separators.length).toBeGreaterThan(0);
  });

  it("sets isDragging on dragStart and clears on dragEnd", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });

    // Simulate drag start
    capturedOnDragStart?.({ active: { id: "t-1" } });
    expect(useUIStore.getState().isDragging).toBe(true);
    expect(useUIStore.getState().draggedTaskId).toBe("t-1");

    // Simulate drag end without a drop target
    capturedOnDragEnd?.({ active: { id: "t-1" }, over: null });
    expect(useUIStore.getState().isDragging).toBe(false);
  });

  it("calls moveTask mutateAsync on dragEnd with a valid over target", async () => {
    const { useMoveTask } = await import("@/api/queries/tasks");
    const mockMutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useMoveTask).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });

    capturedOnDragStart?.({ active: { id: "t-1" } });
    capturedOnDragEnd?.({ active: { id: "t-1" }, over: { id: "done" } });

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ taskId: "t-1", stage: "done" })
    );
  });

  it("flushes queued drag events on dragEnd", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(<KanbanBoard projectId="all" />, { wrapper: wrapper(qc) });

    // Queue an event during drag
    useUIStore.getState().queueDragEvent({ eventName: "task-updated", data: { taskId: "t1", projectId: "p1" } });

    capturedOnDragStart?.({ active: { id: "t-1" } });
    capturedOnDragEnd?.({ active: { id: "t-1" }, over: null });

    // Queued events should have been processed
    expect(invalidateSpy).toHaveBeenCalled();
    expect(useUIStore.getState().dragEventQueue).toHaveLength(0);
  });
});
