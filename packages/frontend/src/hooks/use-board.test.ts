import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { STAGES, STAGE_GROUPS, findTask, useFilteredBoard } from "./use-board";
import { useUIStore } from "../stores/ui-store";
import type { Task } from "../api/types";

describe("STAGES", () => {
  it("contains all twelve expected stages", () => {
    expect(STAGES).toEqual([
      "todo",
      "product",
      "architecture",
      "development",
      "tech_lead_review",
      "devops_build",
      "manual_qa",
      "automation",
      "documentation",
      "devops_deploy",
      "arch_review",
      "done",
    ]);
  });

  it("has exactly 12 stages", () => {
    expect(STAGES).toHaveLength(12);
  });
});

describe("STAGE_GROUPS", () => {
  it("has Build, QA, and Deploy groups", () => {
    expect(Object.keys(STAGE_GROUPS)).toEqual(["Build", "QA", "Deploy"]);
  });

  it("Build group contains expected stages", () => {
    expect(STAGE_GROUPS.Build).toEqual([
      "todo",
      "product",
      "architecture",
      "development",
      "tech_lead_review",
      "devops_build",
    ]);
  });

  it("QA group contains manual_qa and automation", () => {
    expect(STAGE_GROUPS.QA).toEqual(["manual_qa", "automation"]);
  });

  it("Deploy group contains expected stages", () => {
    expect(STAGE_GROUPS.Deploy).toEqual([
      "documentation",
      "devops_deploy",
      "arch_review",
      "done",
    ]);
  });

  it("every stage appears in exactly one group", () => {
    const allGroupStages = Object.values(STAGE_GROUPS).flat();
    // No duplicates
    expect(new Set(allGroupStages).size).toBe(allGroupStages.length);
    // Covers all STAGES
    for (const stage of STAGES) {
      expect(allGroupStages).toContain(stage);
    }
  });
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    title: "Test task",
    stage: "todo",
    priority: "P2",
    type: "feature",
    projectId: "proj-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("findTask", () => {
  it("returns null when board is undefined", () => {
    expect(findTask(undefined, "t-1")).toBeNull();
  });

  it("returns null when task is not in any stage", () => {
    const board = { todo: [makeTask({ id: "t-1" })] };
    expect(findTask(board, "t-99")).toBeNull();
  });

  it("finds a task by string id", () => {
    const task = makeTask({ id: "t-5", title: "Found" });
    const board = { todo: [makeTask({ id: "t-1" })], done: [task] };
    expect(findTask(board, "t-5")).toStrictEqual(task);
  });

  it("finds a task by numeric id (coerced to string)", () => {
    const task = makeTask({ id: "42" });
    const board = { development: [task] };
    expect(findTask(board, 42)).toStrictEqual(task);
  });

  it("returns the first matching task across multiple stages", () => {
    const task = makeTask({ id: "t-3" });
    const board = {
      todo: [makeTask({ id: "t-1" })],
      done: [makeTask({ id: "t-2" }), task],
    };
    expect(findTask(board, "t-3")).toStrictEqual(task);
  });

  it("returns null for an empty board", () => {
    expect(findTask({}, "t-1")).toBeNull();
  });
});

// ---- useFilteredBoard ----

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
  vi.stubGlobal("fetch", vi.fn());
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
});

function boardWith(tasks: Task[]): Record<string, Task[]> {
  return {
    todo: tasks,
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
  };
}

describe("useFilteredBoard", () => {
  it("returns board data when no filters are active", async () => {
    const task = makeTask({ id: "t1", assignedAgent: "dev", priority: "P1", type: "feature" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(boardWith([task])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.todo).toHaveLength(1);
  });

  it("returns undefined data while loading", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    expect(result.current.data).toBeUndefined();
  });

  it("filters tasks by agent", async () => {
    const task1 = makeTask({ id: "t1", assignedAgent: "dev-bot", priority: "P1", type: "feature" });
    const task2 = makeTask({ id: "t2", assignedAgent: "qa-bot", priority: "P1", type: "feature" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(boardWith([task1, task2])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useUIStore.getState().setFilter("agents", ["dev-bot"]);

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.todo).toHaveLength(1);
    expect(result.current.data?.todo[0].id).toBe("t1");
  });

  it("filters out tasks with no assignedAgent when agent filter is set", async () => {
    const task = makeTask({ id: "t1", assignedAgent: undefined, priority: "P1", type: "feature" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(boardWith([task])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useUIStore.getState().setFilter("agents", ["dev-bot"]);

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.todo).toHaveLength(0);
  });

  it("filters tasks by priority", async () => {
    const task1 = makeTask({ id: "t1", priority: "P0", type: "feature" });
    const task2 = makeTask({ id: "t2", priority: "P3", type: "feature" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(boardWith([task1, task2])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useUIStore.getState().setFilter("priorities", ["P0"]);

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.todo).toHaveLength(1);
    expect(result.current.data?.todo[0].id).toBe("t1");
  });

  it("filters tasks by type", async () => {
    const task1 = makeTask({ id: "t1", type: "bug", priority: "P1" });
    const task2 = makeTask({ id: "t2", type: "feature", priority: "P1" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(boardWith([task1, task2])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useUIStore.getState().setFilter("types", ["bug"]);

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.todo).toHaveLength(1);
    expect(result.current.data?.todo[0].id).toBe("t1");
  });

  it("exposes rawData (unfiltered board)", async () => {
    const task = makeTask({ id: "t1", type: "feature", priority: "P1" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(boardWith([task])));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    useUIStore.getState().setFilter("types", ["bug"]); // filter out the feature task

    const { result } = renderHook(() => useFilteredBoard("all"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // filtered data has 0 tasks
    expect(result.current.data?.todo).toHaveLength(0);
    // rawData still has the original task
    expect(result.current.rawData?.todo).toHaveLength(1);
  });
});
