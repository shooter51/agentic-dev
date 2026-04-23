import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useProjects } from "./projects";

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

describe("useProjects", () => {
  it("uses queryKey ['projects']", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const projects = [{ id: "p1", name: "My Project", path: "/", config: null, createdAt: "", updatedAt: "" }];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(projects));

    const { result } = renderHook(() => useProjects(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(["projects"])).toEqual(projects);
  });

  it("fetches from /api/projects", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));

    renderHook(() => useProjects(), { wrapper: wrapper(qc) });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/projects");
  });
});
