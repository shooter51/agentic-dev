import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./ui-store";

// Reset store state before each test
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
    collapsedColumns: new Set<string>(),
  });
});

describe("useUIStore – selection state", () => {
  it("setSelectedProject stores the project id", () => {
    useUIStore.getState().setSelectedProject("proj-1");
    expect(useUIStore.getState().selectedProject).toBe("proj-1");
  });

  it("setSelectedProject accepts null", () => {
    useUIStore.getState().setSelectedProject("proj-1");
    useUIStore.getState().setSelectedProject(null);
    expect(useUIStore.getState().selectedProject).toBeNull();
  });

  it("setSelectedTask stores the task id", () => {
    useUIStore.getState().setSelectedTask("task-42");
    expect(useUIStore.getState().selectedTask).toBe("task-42");
  });

  it("setSelectedTask accepts null", () => {
    useUIStore.getState().setSelectedTask("task-42");
    useUIStore.getState().setSelectedTask(null);
    expect(useUIStore.getState().selectedTask).toBeNull();
  });
});

describe("useUIStore – sidebar / compact mode toggles", () => {
  it("toggleSidebar flips sidebarOpen from true to false", () => {
    expect(useUIStore.getState().sidebarOpen).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("toggleSidebar flips sidebarOpen back to true", () => {
    useUIStore.getState().toggleSidebar();
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it("toggleCompactMode flips compactMode from false to true", () => {
    expect(useUIStore.getState().compactMode).toBe(false);
    useUIStore.getState().toggleCompactMode();
    expect(useUIStore.getState().compactMode).toBe(true);
  });

  it("toggleCompactMode flips compactMode back to false", () => {
    useUIStore.getState().toggleCompactMode();
    useUIStore.getState().toggleCompactMode();
    expect(useUIStore.getState().compactMode).toBe(false);
  });
});

describe("useUIStore – drag state", () => {
  it("setDragging(true, taskId) sets isDragging and draggedTaskId", () => {
    useUIStore.getState().setDragging(true, "task-7");
    const { isDragging, draggedTaskId } = useUIStore.getState();
    expect(isDragging).toBe(true);
    expect(draggedTaskId).toBe("task-7");
  });

  it("setDragging(false) clears draggedTaskId regardless of supplied value", () => {
    useUIStore.getState().setDragging(true, "task-7");
    useUIStore.getState().setDragging(false, "task-7");
    const { isDragging, draggedTaskId } = useUIStore.getState();
    expect(isDragging).toBe(false);
    expect(draggedTaskId).toBeNull();
  });

  it("setDragging(true) without taskId sets draggedTaskId to null", () => {
    useUIStore.getState().setDragging(true);
    expect(useUIStore.getState().draggedTaskId).toBeNull();
    expect(useUIStore.getState().isDragging).toBe(true);
  });

  it("queueDragEvent appends events to the queue", () => {
    useUIStore.getState().queueDragEvent({ eventName: "task-updated", data: { taskId: "t1" } });
    useUIStore.getState().queueDragEvent({ eventName: "agent-status", data: { agentId: "a1" } });
    expect(useUIStore.getState().dragEventQueue).toHaveLength(2);
  });

  it("flushDragQueue returns all queued events and clears the queue", () => {
    useUIStore.getState().queueDragEvent({ eventName: "task-updated", data: {} });
    useUIStore.getState().queueDragEvent({ eventName: "handoff", data: {} });
    const flushed = useUIStore.getState().flushDragQueue();
    expect(flushed).toHaveLength(2);
    expect(flushed[0].eventName).toBe("task-updated");
    expect(useUIStore.getState().dragEventQueue).toHaveLength(0);
  });

  it("flushDragQueue on empty queue returns empty array", () => {
    const flushed = useUIStore.getState().flushDragQueue();
    expect(flushed).toEqual([]);
  });
});

describe("useUIStore – filter state", () => {
  it("setFilter updates the agents filter", () => {
    useUIStore.getState().setFilter("agents", ["agent-1", "agent-2"]);
    expect(useUIStore.getState().activeFilters.agents).toEqual(["agent-1", "agent-2"]);
  });

  it("setFilter updates the priorities filter", () => {
    useUIStore.getState().setFilter("priorities", ["P0", "P1"]);
    expect(useUIStore.getState().activeFilters.priorities).toEqual(["P0", "P1"]);
  });

  it("setFilter updates the types filter", () => {
    useUIStore.getState().setFilter("types", ["bug"]);
    expect(useUIStore.getState().activeFilters.types).toEqual(["bug"]);
  });

  it("setFilter does not affect other filter keys", () => {
    useUIStore.getState().setFilter("agents", ["agent-1"]);
    useUIStore.getState().setFilter("priorities", ["P0"]);
    expect(useUIStore.getState().activeFilters.agents).toEqual(["agent-1"]);
    expect(useUIStore.getState().activeFilters.priorities).toEqual(["P0"]);
    expect(useUIStore.getState().activeFilters.types).toEqual([]);
  });
});

describe("useUIStore – collapsedColumns", () => {
  it("toggleCollapsedColumn adds a stage that was not collapsed", () => {
    useUIStore.getState().toggleCollapsedColumn("todo");
    expect(useUIStore.getState().collapsedColumns.has("todo")).toBe(true);
  });

  it("toggleCollapsedColumn removes a stage that was already collapsed", () => {
    useUIStore.getState().toggleCollapsedColumn("todo");
    useUIStore.getState().toggleCollapsedColumn("todo");
    expect(useUIStore.getState().collapsedColumns.has("todo")).toBe(false);
  });

  it("toggleCollapsedColumn handles multiple independent stages", () => {
    useUIStore.getState().toggleCollapsedColumn("todo");
    useUIStore.getState().toggleCollapsedColumn("done");
    const { collapsedColumns } = useUIStore.getState();
    expect(collapsedColumns.has("todo")).toBe(true);
    expect(collapsedColumns.has("done")).toBe(true);
  });

  it("setCollapsedColumns replaces the set via updater", () => {
    useUIStore.getState().toggleCollapsedColumn("todo");
    useUIStore.getState().setCollapsedColumns(() => new Set(["done"]));
    const { collapsedColumns } = useUIStore.getState();
    expect(collapsedColumns.has("todo")).toBe(false);
    expect(collapsedColumns.has("done")).toBe(true);
  });

  it("setCollapsedColumns updater receives the previous set", () => {
    useUIStore.getState().toggleCollapsedColumn("todo");
    useUIStore.getState().setCollapsedColumns((prev) => {
      const next = new Set(prev);
      next.add("done");
      return next;
    });
    const { collapsedColumns } = useUIStore.getState();
    expect(collapsedColumns.has("todo")).toBe(true);
    expect(collapsedColumns.has("done")).toBe(true);
  });
});
