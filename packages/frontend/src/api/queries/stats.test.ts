import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCostStats, usePipelineStats } from "./stats";

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

describe("useCostStats", () => {
  it("uses queryKey ['stats', 'costs']", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const costData = {
      perAgent: [],
      totals: {
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCostUsd: 0.01,
      },
    };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(costData));

    const { result } = renderHook(() => useCostStats(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["stats", "costs"])).toEqual(costData);
  });

  it("fetches from /api/stats/costs", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ perAgent: [], totals: {} }));

    renderHook(() => useCostStats(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/stats/costs");
  });
});

describe("usePipelineStats", () => {
  it("uses queryKey ['stats', 'pipeline']", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pipelineData = {
      tasksByStage: { todo: 3, done: 10 },
      totalApiCalls: 500,
      avgLatencyMs: 120,
    };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(pipelineData));

    const { result } = renderHook(() => usePipelineStats(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["stats", "pipeline"])).toEqual(pipelineData);
  });

  it("fetches from /api/stats/pipeline", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ tasksByStage: {}, totalApiCalls: 0, avgLatencyMs: 0 }));

    renderHook(() => usePipelineStats(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/stats/pipeline");
  });
});
