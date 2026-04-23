import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "./client";

function makeFetchResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("get", () => {
    it("calls fetch with GET and returns parsed JSON", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue(makeFetchResponse({ id: 1 }));

      const result = await apiClient.get<{ id: number }>("/api/tasks/1");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/tasks/1");
      expect((opts as RequestInit).method).toBeUndefined(); // default GET
      expect(result).toEqual({ id: 1 });
    });

    it("sets Content-Type header", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse({}));
      await apiClient.get("/api/test");
      const [, opts] = vi.mocked(fetch).mock.calls[0];
      expect((opts as RequestInit & { headers: Record<string, string> }).headers["Content-Type"]).toBe(
        "application/json"
      );
    });

    it("throws ApiError with status on non-2xx response", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse("Not found", false, 404));
      await expect(apiClient.get("/api/missing")).rejects.toMatchObject({
        name: "ApiError",
        status: 404,
        message: "Not found",
      });
    });

    it("throws ApiError with status 500", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse("Server error", false, 500));
      await expect(apiClient.get("/api/fail")).rejects.toMatchObject({
        name: "ApiError",
        status: 500,
      });
    });

    it("handles text() failure by using 'Unknown error'", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error("stream error")),
        json: () => Promise.resolve(null),
      } as unknown as Response);

      await expect(apiClient.get("/api/bad")).rejects.toMatchObject({
        name: "ApiError",
        status: 503,
        message: "Unknown error",
      });
    });
  });

  describe("post", () => {
    it("calls fetch with POST method and serialised body", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ created: true }));
      const result = await apiClient.post<{ created: boolean }>("/api/tasks", { title: "New" });

      const [url, opts] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("/api/tasks");
      expect((opts as RequestInit).method).toBe("POST");
      expect((opts as RequestInit).body).toBe(JSON.stringify({ title: "New" }));
      expect(result).toEqual({ created: true });
    });

    it("calls fetch with POST and no body when body is undefined", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse({}));
      await apiClient.post("/api/tasks/1/pause");
      const [, opts] = vi.mocked(fetch).mock.calls[0];
      expect((opts as RequestInit).body).toBeUndefined();
    });

    it("throws ApiError on non-2xx for POST", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse("Conflict", false, 409));
      await expect(apiClient.post("/api/tasks", {})).rejects.toMatchObject({
        name: "ApiError",
        status: 409,
      });
    });
  });

  describe("patch", () => {
    it("calls fetch with PATCH method and serialised body", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ updated: true }));
      const result = await apiClient.patch<{ updated: boolean }>("/api/tasks/1", { stage: "done" });

      const [url, opts] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("/api/tasks/1");
      expect((opts as RequestInit).method).toBe("PATCH");
      expect((opts as RequestInit).body).toBe(JSON.stringify({ stage: "done" }));
      expect(result).toEqual({ updated: true });
    });

    it("calls fetch with PATCH and no body when body is undefined", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse({}));
      await apiClient.patch("/api/tasks/1");
      const [, opts] = vi.mocked(fetch).mock.calls[0];
      expect((opts as RequestInit).body).toBeUndefined();
    });

    it("throws ApiError on non-2xx for PATCH", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse("Bad request", false, 400));
      await expect(apiClient.patch("/api/tasks/1", {})).rejects.toMatchObject({
        name: "ApiError",
        status: 400,
      });
    });
  });

  describe("delete", () => {
    it("calls fetch with DELETE method", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ deleted: true }));
      const result = await apiClient.delete<{ deleted: boolean }>("/api/tasks/1");

      const [url, opts] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("/api/tasks/1");
      expect((opts as RequestInit).method).toBe("DELETE");
      expect(result).toEqual({ deleted: true });
    });

    it("throws ApiError on non-2xx for DELETE", async () => {
      vi.mocked(fetch).mockResolvedValue(makeFetchResponse("Unauthorized", false, 401));
      await expect(apiClient.delete("/api/tasks/1")).rejects.toMatchObject({
        name: "ApiError",
        status: 401,
      });
    });
  });
});
