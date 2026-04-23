import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { StatsPage } from "./StatsPage";

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

const emptyCostStats = {
  perAgent: [],
  totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0 },
};

const emptyPipelineStats = { tasksByStage: {}, totalApiCalls: 0, avgLatencyMs: 0 };

describe("StatsPage", () => {
  it("renders the page heading", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(emptyPipelineStats));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Cost & Pipeline Metrics")).toBeInTheDocument();
  });

  it("shows loading placeholders initially", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    // Multiple "..." placeholders for loading states
    const dots = screen.getAllByText("...");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows tasks completed count", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("pipeline")) {
        return Promise.resolve(makeFetchOk({ tasksByStage: { done: 5 }, totalApiCalls: 100, avgLatencyMs: 50 }));
      }
      return Promise.resolve(makeFetchOk(emptyCostStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("5")).toBeInTheDocument();
  });

  it("shows 'No tasks yet.' when no pipeline data", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("pipeline")) {
        return Promise.resolve(makeFetchOk(emptyPipelineStats));
      }
      return Promise.resolve(makeFetchOk(emptyCostStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No tasks yet.")).toBeInTheDocument();
  });

  it("shows total cost in USD", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("costs")) {
        return Promise.resolve(
          makeFetchOk({
            ...emptyCostStats,
            totals: { ...emptyCostStats.totals, estimatedCostUsd: 1.5 },
          })
        );
      }
      return Promise.resolve(makeFetchOk(emptyPipelineStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("$1.50")).toBeInTheDocument();
  });

  it("shows '$0.00' when cost is below 0.01", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("costs")) {
        return Promise.resolve(
          makeFetchOk({
            ...emptyCostStats,
            totals: { ...emptyCostStats.totals, estimatedCostUsd: 0.005 },
          })
        );
      }
      return Promise.resolve(makeFetchOk(emptyPipelineStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("$0.00")).toBeInTheDocument();
  });

  it("renders stage distribution when tasks exist", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("pipeline")) {
        return Promise.resolve(
          makeFetchOk({ tasksByStage: { todo: 3, done: 7 }, totalApiCalls: 50, avgLatencyMs: 30 })
        );
      }
      return Promise.resolve(makeFetchOk(emptyCostStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Todo")).toBeInTheDocument();
  });

  it("renders Cost by Agent table when perAgent data has entries with cost > 0", async () => {
    const costStats = {
      perAgent: [
        {
          agentId: "dev-bot",
          role: "developer",
          inputTokens: 1000,
          outputTokens: 500,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedCostUsd: 0.05,
        },
      ],
      totals: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0.05 },
    };

    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("costs")) {
        return Promise.resolve(makeFetchOk(costStats));
      }
      return Promise.resolve(makeFetchOk(emptyPipelineStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Cost by Agent")).toBeInTheDocument();
    expect(screen.getByText("dev-bot")).toBeInTheDocument();
  });

  it("formats large numbers with K suffix", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("pipeline")) {
        return Promise.resolve(
          makeFetchOk({ tasksByStage: {}, totalApiCalls: 2500, avgLatencyMs: 10 })
        );
      }
      return Promise.resolve(makeFetchOk(emptyCostStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("2.5K")).toBeInTheDocument();
  });

  it("formats large numbers with M suffix", async () => {
    vi.mocked(fetch).mockImplementation((url) => {
      if (typeof url === "string" && url.includes("pipeline")) {
        return Promise.resolve(
          makeFetchOk({ tasksByStage: {}, totalApiCalls: 1_500_000, avgLatencyMs: 10 })
        );
      }
      return Promise.resolve(makeFetchOk(emptyCostStats));
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<StatsPage />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("1.5M")).toBeInTheDocument();
  });
});
