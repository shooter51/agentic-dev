/**
 * E2E UI tests: Verify frontend auth error handling across all API query hooks.
 *
 * Simulates the scenarios users encounter when their session expires or their
 * token is invalid — the frontend must surface these failures correctly so the
 * application can react (e.g. redirect to login, show an error state).
 *
 * Covers:
 *  - apiClient throws ApiError(401) on unauthenticated responses
 *  - apiClient throws ApiError(403) on forbidden responses
 *  - Every data-fetching query hook propagates auth errors as query errors
 *  - POST/PATCH/DELETE mutations propagate auth errors
 *  - Error shape is consistent (status code preserved)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { apiClient } from "../client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnauthorizedResponse(code = "MISSING_TOKEN") {
  return {
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: { code, message: "Unauthorized" } }),
    text: () =>
      Promise.resolve(JSON.stringify({ error: { code, message: "Unauthorized" } })),
  } as Response;
}

function makeForbiddenResponse() {
  return {
    ok: false,
    status: 403,
    json: () => Promise.resolve({ error: { code: "INSUFFICIENT_ROLE", message: "Forbidden" } }),
    text: () =>
      Promise.resolve(
        JSON.stringify({ error: { code: "INSUFFICIENT_ROLE", message: "Forbidden" } })
      ),
  } as Response;
}

function makeOkResponse(body: unknown) {
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

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// apiClient: auth error propagation
// ---------------------------------------------------------------------------

describe("apiClient: auth error handling", () => {
  it("GET throws ApiError with status 401 on missing token", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse("MISSING_TOKEN"));
    await expect(apiClient.get("/api/projects")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("GET throws ApiError with status 401 on invalid token", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse("INVALID_ACCESS_TOKEN"));
    await expect(apiClient.get("/api/agents")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("GET throws ApiError with status 403 on insufficient role", async () => {
    vi.mocked(fetch).mockResolvedValue(makeForbiddenResponse());
    await expect(apiClient.get("/api/admin/users")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
    });
  });

  it("POST throws ApiError with status 401 on unauthenticated request", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    await expect(apiClient.post("/api/projects", { name: "x", path: "/" })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("PATCH throws ApiError with status 401 on unauthenticated request", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    await expect(apiClient.patch("/api/tasks/t1", { title: "updated" })).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("DELETE throws ApiError with status 401 on unauthenticated request", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    await expect(apiClient.delete("/api/tasks/t1")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("error preserves the response body text for debugging", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse("MISSING_TOKEN"));
    let caught: Error | null = null;
    try {
      await apiClient.get("/api/projects");
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("Unauthorized");
  });
});

// ---------------------------------------------------------------------------
// React Query hooks: auth error propagation
// ---------------------------------------------------------------------------

describe("useBoard: auth error propagation", () => {
  it("query enters error state with status 401 on unauthorized response", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useBoard } = await import("../queries/tasks");
    const { result } = renderHook(() => useBoard("proj-1"), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

describe("useTask: auth error propagation", () => {
  it("query enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useTask } = await import("../queries/tasks");
    const { result } = renderHook(() => useTask("task-1"), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

describe("useAgents: auth error propagation", () => {
  it("query enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useAgents } = await import("../queries/agents");
    const { result } = renderHook(() => useAgents(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

describe("useProjects: auth error propagation", () => {
  it("query enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useProjects } = await import("../queries/projects");
    const { result } = renderHook(() => useProjects(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

describe("useMessages / usePendingMessages: auth error propagation", () => {
  it("usePendingMessages enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { usePendingMessages } = await import("../queries/messages");
    const { result } = renderHook(() => usePendingMessages(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

describe("useAgentMemories: auth error propagation", () => {
  it("query enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useAgentMemories } = await import("../queries/memories");
    const { result } = renderHook(() => useAgentMemories("agent-1"), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

describe("useCostStats / usePipelineStats: auth error propagation", () => {
  it("useCostStats enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useCostStats } = await import("../queries/stats");
    const { result } = renderHook(() => useCostStats(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });

  it("usePipelineStats enters error state on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { usePipelineStats } = await import("../queries/stats");
    const { result } = renderHook(() => usePipelineStats(), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Mutation auth errors
// ---------------------------------------------------------------------------

describe("useMoveTask: auth error on mutation", () => {
  it("mutation surfaces 401 error", async () => {
    vi.mocked(fetch).mockResolvedValue(makeUnauthorizedResponse());
    const qc = makeQC();

    const { useMoveTask } = await import("../queries/tasks");
    const { result } = renderHook(() => useMoveTask(), { wrapper: wrapper(qc) });

    result.current.mutate({ taskId: "t1", stage: "done" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as any)?.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Auth vs success: verify success path still works after auth mock is removed
// ---------------------------------------------------------------------------

describe("apiClient: successful call after auth mock reset", () => {
  it("returns data after 401 when fetch mock is corrected", async () => {
    const mockFetch = vi.mocked(fetch);

    // First call: 401
    mockFetch.mockResolvedValueOnce(makeUnauthorizedResponse());
    await expect(apiClient.get("/api/projects")).rejects.toMatchObject({ status: 401 });

    // Second call: 200 (simulates token refresh + retry)
    mockFetch.mockResolvedValueOnce(makeOkResponse([{ id: "proj-1", name: "Test" }]));
    const result = await apiClient.get<unknown[]>("/api/projects");
    expect(result).toHaveLength(1);
  });
});
