import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { AgentCard } from "./AgentCard";
import { useUIStore } from "@/stores/ui-store";
import type { Agent } from "@/api/types";

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

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Dev Agent",
    role: "developer",
    status: "idle",
    ...overrides,
  };
}

describe("AgentCard", () => {
  it("renders agent name", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ name: "QA Bot" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("QA Bot")).toBeInTheDocument();
  });

  it("renders agent role", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ role: "qa" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("qa")).toBeInTheDocument();
  });

  it("shows Idle status badge", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "idle" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("shows Busy status badge", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "busy" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Busy")).toBeInTheDocument();
  });

  it("shows Error status badge", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "error" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows Paused status badge", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "paused" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows Resume button when agent is paused", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "paused" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("shows Pause button when agent is busy", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "busy" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Pause")).toBeInTheDocument();
  });

  it("shows Pause button when agent is idle", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "idle" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Pause")).toBeInTheDocument();
  });

  it("does not show Pause or Resume button when agent status is error", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ status: "error" })} />, { wrapper: wrapper(qc) });
    expect(screen.queryByText("Pause")).not.toBeInTheDocument();
    expect(screen.queryByText("Resume")).not.toBeInTheDocument();
  });

  it("renders current task link when currentTaskId is set", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ currentTaskId: "task-99" })} />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Working on: task-99")).toBeInTheDocument();
  });

  it("clicking current task link sets selectedTask", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AgentCard agent={makeAgent({ currentTaskId: "task-99" })} />, { wrapper: wrapper(qc) });
    fireEvent.click(screen.getByText("Working on: task-99"));
    expect(useUIStore.getState().selectedTask).toBe("task-99");
  });

  it("clicking expand button reveals memory section", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentCard agent={makeAgent()} />, { wrapper: wrapper(qc) });
    fireEvent.click(screen.getByTitle("Show memories"));
    expect(await screen.findByText("Memories")).toBeInTheDocument();
  });

  it("clicking expand button again collapses memory section", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentCard agent={makeAgent()} />, { wrapper: wrapper(qc) });
    fireEvent.click(screen.getByTitle("Show memories"));
    await screen.findByText("Memories");
    fireEvent.click(screen.getByTitle("Collapse"));
    expect(screen.queryByText("Memories")).not.toBeInTheDocument();
  });

  it("calls pause mutation when Pause button is clicked", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    render(<AgentCard agent={makeAgent({ status: "idle" })} />, { wrapper: wrapper(qc) });
    fireEvent.click(screen.getByText("Pause"));
    // fetch is async — wait for it to be called
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/agents/agent-1/pause",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("calls resume mutation when Resume button is clicked", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentCard agent={makeAgent({ status: "paused" })} />, { wrapper: wrapper(qc) });
    fireEvent.click(screen.getByText("Resume"));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/agents/agent-1/resume",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
