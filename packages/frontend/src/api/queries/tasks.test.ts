import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useBoard, useTask, useTaskHistory, useMoveTask } from "./tasks";

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

describe("useBoard", () => {
  it("uses queryKey ['board', projectId]", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ todo: [], done: [] }));

    const { result } = renderHook(() => useBoard("proj-1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["board", "proj-1"])).toEqual({ todo: [], done: [] });
  });

  it("fetches from /api/projects/:projectId/board", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    renderHook(() => useBoard("my-project"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/projects/my-project/board");
  });
});

describe("useTask", () => {
  it("uses queryKey ['tasks', taskId]", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const task = { id: "t1", title: "Hello" };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(task));

    const { result } = renderHook(() => useTask("t1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["tasks", "t1"])).toEqual(task);
  });

  it("is disabled when taskId is empty string", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useTask(""), { wrapper: wrapper(qc) });
    // should stay in pending state — never fires fetch
    expect(result.current.fetchStatus).toBe("idle");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("fetches from /api/tasks/:taskId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    renderHook(() => useTask("t99"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/tasks/t99");
  });
});

describe("useTaskHistory", () => {
  it("uses queryKey ['task-history', taskId]", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const history = [{ id: "h1", eventType: "moved" }];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(history));

    const { result } = renderHook(() => useTaskHistory("t2"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["task-history", "t2"])).toEqual(history);
  });

  it("is disabled when taskId is empty string", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useTaskHistory(""), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("fetches from /api/tasks/:taskId/history", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => useTaskHistory("t-hist"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/tasks/t-hist/history");
  });
});

describe("useMoveTask", () => {
  it("calls POST /api/tasks/:taskId/move with stage in body", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ id: "t1", stage: "done" }));

    const { result } = renderHook(() => useMoveTask(), { wrapper: wrapper(qc) });
    result.current.mutate({ taskId: "t1", stage: "done" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/tasks/t1/move");
    expect((opts as RequestInit).method).toBe("POST");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ stage: "done" });
  });

  it("invalidates board and task queries on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ id: "t1" }));

    const { result } = renderHook(() => useMoveTask(), { wrapper: wrapper(qc) });
    result.current.mutate({ taskId: "t1", stage: "done" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["board"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks", "t1"] });
  });
});
