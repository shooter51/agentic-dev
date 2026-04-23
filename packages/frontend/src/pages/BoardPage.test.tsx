import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { BoardPage } from "./BoardPage";
import { useUIStore } from "@/stores/ui-store";

// Mock heavy components
vi.mock("@/components/board/KanbanBoard", () => ({
  KanbanBoard: ({ projectId }: { projectId: string }) => (
    <div data-testid="kanban-board" data-project={projectId}>
      Kanban Board
    </div>
  ),
}));

vi.mock("@/components/task/TaskDetail", () => ({
  TaskDetail: () => <div data-testid="task-detail">Task Detail</div>,
}));

vi.mock("@/hooks/use-sse", () => ({
  useSSE: vi.fn(),
}));

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
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
  vi.restoreAllMocks();
});

describe("BoardPage", () => {
  it("renders KanbanBoard and TaskDetail", () => {
    const qc = new QueryClient();
    render(<BoardPage />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("kanban-board")).toBeInTheDocument();
    expect(screen.getByTestId("task-detail")).toBeInTheDocument();
  });

  it('passes "all" as projectId when no project is selected', () => {
    useUIStore.setState({ selectedProject: null });
    const qc = new QueryClient();
    render(<BoardPage />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("kanban-board")).toHaveAttribute("data-project", "all");
  });

  it("passes selected project id to KanbanBoard", () => {
    useUIStore.setState({ selectedProject: "proj-42" });
    const qc = new QueryClient();
    render(<BoardPage />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("kanban-board")).toHaveAttribute("data-project", "proj-42");
  });
});
