import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { Header } from "./Header";
import { useUIStore } from "@/stores/ui-store";

function makeFetchOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function wrapper(queryClient: QueryClient, initialEntries = ["/"]) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries },
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
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

describe("Header", () => {
  it("renders the app title", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Agentic Dev")).toBeInTheDocument();
  });

  it("renders Board and Stats navigation links", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
  });

  it("renders project selector with All Projects option", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });
    expect(screen.getByText("All Projects")).toBeInTheDocument();
  });

  it("toggles compact mode when compact button is clicked", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });

    expect(useUIStore.getState().compactMode).toBe(false);
    fireEvent.click(screen.getByTitle("Compact view"));
    expect(useUIStore.getState().compactMode).toBe(true);
  });

  it("toggles sidebar when sidebar button is clicked", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });

    expect(useUIStore.getState().sidebarOpen).toBe(true);
    fireEvent.click(screen.getByTitle("Hide agent panel"));
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("shows agent error badge when agents have errors", async () => {
    const agents = [
      { id: "a1", name: "Dev", role: "developer", status: "error" },
      { id: "a2", name: "QA", role: "qa", status: "idle" },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<Header />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("1 agent error")).toBeInTheDocument();
  });

  it("shows plural agent errors badge for multiple errors", async () => {
    const agents = [
      { id: "a1", name: "Dev", role: "developer", status: "error" },
      { id: "a2", name: "QA", role: "qa", status: "error" },
    ];
    // fetch is called multiple times (agents, pending messages, projects)
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<Header />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("2 agent errors")).toBeInTheDocument();
  });

  it("shows pending messages badge", async () => {
    // agents = [], pending = [msg], projects = []
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("pending")) {
        return Promise.resolve(makeFetchOk([{ id: "m1" }]));
      }
      return Promise.resolve(makeFetchOk([]));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("1 pending")).toBeInTheDocument();
  });

  it("auto-selects first project when projects loaded and none selected", async () => {
    const projects = [{ id: "proj-first", name: "First Project", path: "/", config: null, createdAt: "", updatedAt: "" }];
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/projects")) {
        return Promise.resolve(makeFetchOk(projects));
      }
      return Promise.resolve(makeFetchOk([]));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Header />, { wrapper: wrapper(qc) });
    await screen.findByText("First Project");
    expect(useUIStore.getState().selectedProject).toBe("proj-first");
  });

  it("changing select to 'all' sets selectedProject to null", async () => {
    useUIStore.setState({ selectedProject: "proj-1" });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<Header />, { wrapper: wrapper(qc) });
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "all" } });
    expect(useUIStore.getState().selectedProject).toBeNull();
  });
});
