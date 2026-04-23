import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAgentMemories, useEditMemory, useDeleteMemory } from "./memories";

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

describe("useAgentMemories", () => {
  it("uses queryKey ['memories', agentId]", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const memories = [{ id: "m1", agentId: "a1", key: "ctx", value: "data", updatedAt: "" }];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(memories));

    const { result } = renderHook(() => useAgentMemories("a1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["memories", "a1"])).toEqual(memories);
  });

  it("fetches from /api/agents/:agentId/memories", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => useAgentMemories("agent-5"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents/agent-5/memories");
  });

  it("is disabled when agentId is empty", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAgentMemories(""), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useEditMemory", () => {
  it("calls PATCH /api/agents/:agentId/memories/:memoryId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ id: "m1", value: "new" }));

    const { result } = renderHook(() => useEditMemory(), { wrapper: wrapper(qc) });
    result.current.mutate({ agentId: "a1", memoryId: "m1", value: "new" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents/a1/memories/m1");
    expect((opts as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ value: "new" });
  });

  it("invalidates memories queries on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => useEditMemory(), { wrapper: wrapper(qc) });
    result.current.mutate({ agentId: "a1", memoryId: "m1", value: "updated" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["memories", "a1"] });
  });
});

describe("useDeleteMemory", () => {
  it("calls DELETE /api/agents/:agentId/memories/:memoryId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => useDeleteMemory(), { wrapper: wrapper(qc) });
    result.current.mutate({ agentId: "a1", memoryId: "m1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents/a1/memories/m1");
    expect((opts as RequestInit).method).toBe("DELETE");
  });

  it("invalidates memories queries on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => useDeleteMemory(), { wrapper: wrapper(qc) });
    result.current.mutate({ agentId: "a1", memoryId: "m1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["memories", "a1"] });
  });
});
