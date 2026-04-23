import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useMessages, usePendingMessages, useSendOperatorMessage } from "./messages";

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

describe("useMessages", () => {
  it("fetches from /api/tasks/:taskId/messages when taskId provided", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => useMessages("t1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/tasks/t1/messages");
  });

  it("uses queryKey ['messages', taskId] when taskId provided", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([{ id: "msg1" }]));

    const { result } = renderHook(() => useMessages("t1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["messages", "t1"])).toEqual([{ id: "msg1" }]);
  });

  it("fetches from /api/messages when no taskId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => useMessages(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/messages");
  });

  it("uses queryKey ['messages'] when no taskId", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    const { result } = renderHook(() => useMessages(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["messages"])).toEqual([]);
  });
});

describe("usePendingMessages", () => {
  it("uses queryKey ['messages', 'pending']", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([{ id: "p1" }]));

    const { result } = renderHook(() => usePendingMessages(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["messages", "pending"])).toEqual([{ id: "p1" }]);
  });

  it("fetches from /api/messages/pending", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => usePendingMessages(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/messages/pending");
  });
});

describe("useSendOperatorMessage", () => {
  it("calls POST /api/tasks/:taskId/messages with content", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ id: "msg1" }));

    const { result } = renderHook(() => useSendOperatorMessage(), { wrapper: wrapper(qc) });
    result.current.mutate({ taskId: "t1", content: "Hello" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/tasks/t1/messages");
    expect((opts as RequestInit).method).toBe("POST");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual({ content: "Hello" });
  });

  it("invalidates message queries on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));

    const { result } = renderHook(() => useSendOperatorMessage(), { wrapper: wrapper(qc) });
    result.current.mutate({ taskId: "t1", content: "Reply" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["messages", "t1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["messages", "pending"] });
  });
});
