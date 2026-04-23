import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskCard } from "./TaskCard";
import { useUIStore } from "@/stores/ui-store";
import type { Task } from "@/api/types";

// Mock @dnd-kit/sortable to avoid needing DndContext wrapper
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    title: "Test Task",
    stage: "todo",
    priority: "P2",
    type: "feature",
    projectId: "proj-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
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

describe("TaskCard (normal mode)", () => {
  it("renders the task title", () => {
    render(<TaskCard task={makeTask({ title: "My Feature" })} />);
    expect(screen.getByText("My Feature")).toBeInTheDocument();
  });

  it("renders the priority badge", () => {
    render(<TaskCard task={makeTask({ priority: "P0" })} />);
    expect(screen.getByText("P0")).toBeInTheDocument();
  });

  it("renders Bug badge when type is bug", () => {
    render(<TaskCard task={makeTask({ type: "bug" })} />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("does not render Bug badge for non-bug types", () => {
    render(<TaskCard task={makeTask({ type: "feature" })} />);
    expect(screen.queryByText("Bug")).not.toBeInTheDocument();
  });

  it("renders beadsId when present", () => {
    render(<TaskCard task={makeTask({ beadsId: "BEADS-123" })} />);
    expect(screen.getByText("BEADS-123")).toBeInTheDocument();
  });

  it("renders AgentAvatar when assignedAgent is present", () => {
    render(<TaskCard task={makeTask({ assignedAgent: "dev-agent" })} />);
    expect(screen.getByTitle("dev-agent")).toBeInTheDocument();
  });

  it("calls setSelectedTask with the task id on click", () => {
    const task = makeTask({ id: "t-7" });
    render(<TaskCard task={task} />);
    fireEvent.click(screen.getByText("Test Task"));
    expect(useUIStore.getState().selectedTask).toBe("t-7");
  });

  it("applies opacity-50 class when isDragging is true", () => {
    const { container } = render(<TaskCard task={makeTask()} isDragging />);
    expect(container.firstChild).toHaveClass("opacity-50");
  });
});

describe("TaskCard (compact mode)", () => {
  it("renders in compact layout when compact=true", () => {
    render(<TaskCard task={makeTask({ title: "Compact Task" })} compact />);
    expect(screen.getByText("Compact Task")).toBeInTheDocument();
  });

  it("renders Bug badge in compact mode when type is bug", () => {
    render(<TaskCard task={makeTask({ type: "bug" })} compact />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
  });

  it("applies opacity-50 in compact mode when isDragging", () => {
    const { container } = render(<TaskCard task={makeTask()} compact isDragging />);
    expect(container.firstChild).toHaveClass("opacity-50");
  });

  it("calls setSelectedTask on click in compact mode", () => {
    const task = makeTask({ id: "t-compact" });
    render(<TaskCard task={task} compact />);
    fireEvent.click(screen.getByText("Test Task"));
    expect(useUIStore.getState().selectedTask).toBe("t-compact");
  });
});
