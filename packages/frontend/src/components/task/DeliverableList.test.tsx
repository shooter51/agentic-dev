import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { DeliverableList } from "./DeliverableList";

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

describe("DeliverableList", () => {
  it("renders loading text while fetching", () => {
    // Keep fetch pending
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<DeliverableList taskId="t1" />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Loading deliverables...")).toBeInTheDocument();
  });

  it("renders empty state when deliverables array is empty", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<DeliverableList taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No deliverables yet.")).toBeInTheDocument();
  });

  it("renders deliverable items when data is returned", async () => {
    const deliverables = [
      {
        id: "d1",
        taskId: "t1",
        agentId: "agent-1",
        type: "prd",
        title: "Product Requirements",
        content: "Some PRD content here",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(deliverables));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<DeliverableList taskId="t1" />, { wrapper: wrapper(qc) });

    expect(await screen.findByText("Product Requirements")).toBeInTheDocument();
    expect(screen.getByText("PRD")).toBeInTheDocument();
    expect(screen.getByText("Some PRD content here")).toBeInTheDocument();
  });

  it("uses the raw type string when type is not in TYPE_LABELS", async () => {
    const deliverables = [
      {
        id: "d2",
        taskId: "t1",
        agentId: "agent-1",
        type: "custom_report",
        title: "Custom",
        content: "Custom content",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(deliverables));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<DeliverableList taskId="t1" />, { wrapper: wrapper(qc) });

    expect(await screen.findByText("custom_report")).toBeInTheDocument();
  });

  it("truncates content longer than 500 characters", async () => {
    const longContent = "x".repeat(600);
    const deliverables = [
      {
        id: "d3",
        taskId: "t1",
        agentId: "agent-1",
        type: "adr",
        title: "ADR Doc",
        content: longContent,
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(deliverables));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<DeliverableList taskId="t1" />, { wrapper: wrapper(qc) });

    await screen.findByText("ADR Doc");
    const contentEl = document.querySelector(".whitespace-pre-wrap");
    expect(contentEl?.textContent).toContain("...");
    expect(contentEl?.textContent?.length).toBeLessThan(600);
  });

  it("renders test_report type label", async () => {
    const deliverables = [
      {
        id: "d4",
        taskId: "t1",
        agentId: "a1",
        type: "test_report",
        title: "TR Title",
        content: "content",
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(deliverables));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<DeliverableList taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Test Report")).toBeInTheDocument();
  });
});
