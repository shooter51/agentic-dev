import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { TaskHistory } from "./TaskHistory";

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

describe("TaskHistory", () => {
  it("shows loading text while fetching", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Loading history...")).toBeInTheDocument();
  });

  it("shows empty state when no events", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No history yet.")).toBeInTheDocument();
  });

  it("renders event type", async () => {
    const events = [
      { id: "e1", taskId: "t1", eventType: "stage_changed", createdAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(events));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("stage_changed")).toBeInTheDocument();
  });

  it("renders stage badges when fromStage and toStage are present", async () => {
    const events = [
      {
        id: "e1",
        taskId: "t1",
        eventType: "moved",
        fromStage: "todo",
        toStage: "development",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(events));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Todo")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
  });

  it("renders optional message when present", async () => {
    const events = [
      {
        id: "e1",
        taskId: "t1",
        eventType: "note",
        message: "This is a note",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(events));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("This is a note")).toBeInTheDocument();
  });

  it("renders agent avatar when agentId is present", async () => {
    const events = [
      {
        id: "e1",
        taskId: "t1",
        eventType: "moved",
        agentId: "dev-agent",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(events));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByTitle("dev-agent")).toBeInTheDocument();
  });

  it("renders multiple events", async () => {
    const events = [
      { id: "e1", taskId: "t1", eventType: "created", createdAt: new Date().toISOString() },
      { id: "e2", taskId: "t1", eventType: "assigned", createdAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(events));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<TaskHistory taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("created")).toBeInTheDocument();
    expect(screen.getByText("assigned")).toBeInTheDocument();
  });
});
