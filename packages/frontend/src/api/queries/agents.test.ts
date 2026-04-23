import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useAgents, useAgent, usePauseAgent, useResumeAgent } from "./agents";

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

describe("useAgents", () => {
  it("uses queryKey ['agents']", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const agents = [{ id: "a1", name: "Dev Agent", role: "developer", status: "idle" }];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agents));

    const { result } = renderHook(() => useAgents(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["agents"])).toEqual(agents);
  });

  it("fetches from /api/agents", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => useAgents(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents");
  });
});

describe("useAgent", () => {
  it("uses queryKey ['agents', agentId]", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const agent = { id: "a2", name: "QA", role: "qa", status: "busy" };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(agent));

    const { result } = renderHook(() => useAgent("a2"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["agents", "a2"])).toEqual(agent);
  });

  it("is disabled when agentId is empty string", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useAgent(""), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("fetches from /api/agents/:agentId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    renderHook(() => useAgent("agent-99"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents/agent-99");
  });
});

describe("usePauseAgent", () => {
  it("calls POST /api/agents/:agentId/pause", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => usePauseAgent(), { wrapper: wrapper(qc) });
    result.current.mutate("agent-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents/agent-1/pause");
    expect((opts as RequestInit).method).toBe("POST");
  });

  it("invalidates agents queries on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => usePauseAgent(), { wrapper: wrapper(qc) });
    result.current.mutate("agent-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["agents"] });
  });
});

describe("useResumeAgent", () => {
  it("calls POST /api/agents/:agentId/resume", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => useResumeAgent(), { wrapper: wrapper(qc) });
    result.current.mutate("agent-2");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/agents/agent-2/resume");
    expect((opts as RequestInit).method).toBe("POST");
  });

  it("invalidates agents queries on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => useResumeAgent(), { wrapper: wrapper(qc) });
    result.current.mutate("agent-2");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["agents"] });
  });
});
