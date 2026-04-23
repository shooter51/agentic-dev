import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KanbanColumn } from "./KanbanColumn";
import type { Task } from "@/api/types";

// Mock dnd-kit to avoid needing DndContext
vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  DndContext: ({ children }: { children: React.ReactNode }) => children,
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

describe("KanbanColumn", () => {
  it("renders tasks in the column", () => {
    const tasks = [makeTask({ id: "t1", title: "Task One" })];
    render(
      <KanbanColumn
        stage="todo"
        tasks={tasks}
        collapsed={false}
        compact={false}
        onToggleCollapse={vi.fn()}
      />
    );
    expect(screen.getByText("Task One")).toBeInTheDocument();
  });

  it("shows 'Drop tasks here' when there are no tasks", () => {
    render(
      <KanbanColumn
        stage="todo"
        tasks={[]}
        collapsed={false}
        compact={false}
        onToggleCollapse={vi.fn()}
      />
    );
    expect(screen.getByText("Drop tasks here")).toBeInTheDocument();
  });

  it("renders collapsed view when collapsed=true", () => {
    render(
      <KanbanColumn
        stage="todo"
        tasks={[]}
        collapsed
        compact={false}
        onToggleCollapse={vi.fn()}
      />
    );
    // In collapsed mode the label is rendered vertically — still present in DOM
    expect(screen.getByText("Todo")).toBeInTheDocument();
    // "Drop tasks here" should not be shown in collapsed mode
    expect(screen.queryByText("Drop tasks here")).not.toBeInTheDocument();
  });

  it("calls onToggleCollapse when collapsed column is clicked", () => {
    const onToggle = vi.fn();
    render(
      <KanbanColumn
        stage="todo"
        tasks={[]}
        collapsed
        compact={false}
        onToggleCollapse={onToggle}
      />
    );
    fireEvent.click(screen.getByText("Todo").closest("div")!.parentElement!);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("renders multiple tasks", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Task A" }),
      makeTask({ id: "t2", title: "Task B" }),
    ];
    render(
      <KanbanColumn
        stage="done"
        tasks={tasks}
        collapsed={false}
        compact={false}
        onToggleCollapse={vi.fn()}
      />
    );
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });
});
