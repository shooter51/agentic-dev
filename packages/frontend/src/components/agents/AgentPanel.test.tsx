import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { AgentPanel } from "./AgentPanel";
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: "agent-1",
  name: "Dev Agent",
  role: "developer",
  status: "idle",
  ...overrides,
});

describe("AgentPanel", () => {
  it("shows loading text while fetching", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Loading agents...")).toBeInTheDocument();
  });

  it("shows empty state when no agents", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No agents registered.")).toBeInTheDocument();
  });

  it("shows agent counts in header", async () => {
    const agents = [
      makeAgent({ id: "a1", status: "busy" }),
      makeAgent({ id: "a2", status: "idle" }),
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("1 active · 1 idle")).toBeInTheDocument();
  });

  it("renders error agents section when errors exist", async () => {
    const agents = [makeAgent({ id: "a1", status: "error" })];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Errors (1)")).toBeInTheDocument();
  });

  it("renders busy agents section", async () => {
    const agents = [makeAgent({ id: "a1", status: "busy" })];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Active (1)")).toBeInTheDocument();
  });

  it("renders paused agents section", async () => {
    const agents = [makeAgent({ id: "a1", status: "paused" })];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Paused (1)")).toBeInTheDocument();
  });

  it("renders idle agents section", async () => {
    const agents = [makeAgent({ id: "a1", status: "idle" })];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<AgentPanel />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Idle (1)")).toBeInTheDocument();
  });
});
