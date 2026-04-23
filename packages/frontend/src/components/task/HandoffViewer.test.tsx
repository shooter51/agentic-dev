import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { HandoffViewer } from "./HandoffViewer";

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeFetchOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HandoffViewer", () => {
  it("renders loading text while fetching", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<HandoffViewer taskId="t1" />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Loading handoffs...")).toBeInTheDocument();
  });

  it("renders empty state when handoffs array is empty", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<HandoffViewer taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No handoffs yet.")).toBeInTheDocument();
  });

  it("renders handoff items when data is returned", async () => {
    const handoffs = [
      {
        id: "h1",
        taskId: "t1",
        fromAgent: "dev-agent",
        fromStage: "development",
        toStage: "tech_lead_review",
        content: "Ready for review",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(handoffs));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<HandoffViewer taskId="t1" />, { wrapper: wrapper(qc) });

    expect(await screen.findByText("Ready for review")).toBeInTheDocument();
    // StageBadge for fromStage and toStage
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByText("TL Review")).toBeInTheDocument();
    // AgentAvatar renders with agentId as title
    expect(screen.getByTitle("dev-agent")).toBeInTheDocument();
  });

  it("renders multiple handoff rows", async () => {
    const handoffs = [
      {
        id: "h1",
        taskId: "t1",
        fromAgent: "dev-agent",
        fromStage: "development",
        toStage: "manual_qa",
        content: "First handoff",
        createdAt: new Date().toISOString(),
      },
      {
        id: "h2",
        taskId: "t1",
        fromAgent: "qa-agent",
        fromStage: "manual_qa",
        toStage: "done",
        content: "Second handoff",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(handoffs));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<HandoffViewer taskId="t1" />, { wrapper: wrapper(qc) });

    expect(await screen.findByText("First handoff")).toBeInTheDocument();
    expect(screen.getByText("Second handoff")).toBeInTheDocument();
  });

  it("renders the arrow between stages", async () => {
    const handoffs = [
      {
        id: "h1",
        taskId: "t1",
        fromAgent: "dev-agent",
        fromStage: "todo",
        toStage: "done",
        content: "content",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(handoffs));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<HandoffViewer taskId="t1" />, { wrapper: wrapper(qc) });

    await screen.findByText("content");
    // Arrow is rendered as → (HTML entity &rarr;)
    expect(screen.getByText("→")).toBeInTheDocument();
  });
});
