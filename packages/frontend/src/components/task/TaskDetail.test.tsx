import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { TaskDetail } from "./TaskDetail";
import { useUIStore } from "@/stores/ui-store";

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

const makeTask = (overrides = {}) => ({
  id: "t-detail",
  title: "Detail Task",
  stage: "development",
  priority: "P1",
  type: "feature",
  projectId: "proj-1",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("TaskDetail", () => {
  it("does not render the sheet content when no task is selected", () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(null));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });
    // When closed, sheet content should not be in the DOM
    expect(screen.queryByText("Detail Task")).not.toBeInTheDocument();
  });

  it("shows 'Loading...' title while task is loading", async () => {
    // Keep fetch pending
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Loading...")).toBeInTheDocument();
  });

  it("renders task title when loaded", async () => {
    const task = makeTask();
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Detail Task")).toBeInTheDocument();
  });

  it("renders priority and stage badges when task is loaded", async () => {
    const task = makeTask();
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("P1")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
  });

  it("shows Bug badge when task type is bug", async () => {
    const task = makeTask({ type: "bug" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Bug")).toBeInTheDocument();
  });

  it("renders beadsId when present", async () => {
    const task = makeTask({ beadsId: "BEADS-99" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("BEADS-99")).toBeInTheDocument();
  });

  it("closes the sheet by setting selectedTask to null via onOpenChange", async () => {
    // The Sheet calls onOpenChange(false) when user presses Escape
    // The component wraps it with: onOpenChange={(open) => !open && setSelectedTask(null)}
    const task = makeTask();
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });

    // Wait for the sheet to open
    await screen.findByText("Detail Task");
    expect(useUIStore.getState().selectedTask).toBe("t-detail");

    // Simulate Escape key to close the radix Sheet
    const { fireEvent: fe } = await import("@testing-library/react");
    fe.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(useUIStore.getState().selectedTask).toBeNull());
  });

  it("renders Details, History, Messages, Artifacts tabs", async () => {
    const task = makeTask();
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });

    expect(await screen.findByText("Details")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.getByText("Artifacts")).toBeInTheDocument();
  });

  it("renders assigned agent avatar when task has assignedAgent", async () => {
    const task = makeTask({ assignedAgent: "dev-agent-1" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });

    expect(await screen.findByTitle("dev-agent-1")).toBeInTheDocument();
    expect(screen.getByText("dev-agent-1")).toBeInTheDocument();
  });

  it("renders task description when present", async () => {
    const task = makeTask({ description: "A detailed description" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));
    useUIStore.setState({ selectedTask: "t-detail" });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskDetail />, { wrapper: wrapper(qc) });

    expect(await screen.findByText("A detailed description")).toBeInTheDocument();
  });
});
