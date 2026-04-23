import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { Sidebar } from "./Sidebar";
import { useUIStore } from "@/stores/ui-store";

// AgentPanel uses useAgents which calls fetch
vi.mock("@/components/agents/AgentPanel", () => ({
  AgentPanel: () => <div data-testid="agent-panel">Agent Panel</div>,
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

describe("Sidebar", () => {
  it("renders AgentPanel when sidebarOpen is true", () => {
    const qc = new QueryClient();
    render(<Sidebar />, { wrapper: wrapper(qc) });
    expect(screen.getByTestId("agent-panel")).toBeInTheDocument();
  });

  it("does not render AgentPanel when sidebarOpen is false", () => {
    useUIStore.setState({ sidebarOpen: false });
    const qc = new QueryClient();
    render(<Sidebar />, { wrapper: wrapper(qc) });
    expect(screen.queryByTestId("agent-panel")).not.toBeInTheDocument();
  });

  it("applies w-72 class when open", () => {
    const { container } = render(<Sidebar />);
    expect(container.firstChild).toHaveClass("w-72");
  });

  it("applies w-0 class when closed", () => {
    useUIStore.setState({ sidebarOpen: false });
    const { container } = render(<Sidebar />);
    expect(container.firstChild).toHaveClass("w-0");
  });
});
