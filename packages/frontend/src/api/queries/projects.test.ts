import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useProjects, useCreateProject } from "./projects";

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

describe("useCreateProject", () => {
  it("posts to /api/projects with name and path", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const created = { id: "new-1", name: "New", path: "/new", config: null, createdAt: "", updatedAt: "" };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(created));

    const { result } = renderHook(() => useCreateProject(), { wrapper: wrapper(qc) });

    result.current.mutate({ name: "New", path: "/new" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/projects");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({ name: "New", path: "/new" });
  });

  it("passes config when provided", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const created = { id: "new-2", name: "X", path: "/x", config: '{"a":1}', createdAt: "", updatedAt: "" };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(created));

    const { result } = renderHook(() => useCreateProject(), { wrapper: wrapper(qc) });

    result.current.mutate({ name: "X", path: "/x", config: '{"a":1}' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.config).toBe('{"a":1}');
  });

  it("invalidates projects query on success", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const created = { id: "new-3", name: "Y", path: "/y", config: null, createdAt: "", updatedAt: "" };
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(created));

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useCreateProject(), { wrapper: wrapper(qc) });

    result.current.mutate({ name: "Y", path: "/y" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["projects"] });
  });
});
