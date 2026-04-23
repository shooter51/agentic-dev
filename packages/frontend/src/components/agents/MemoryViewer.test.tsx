import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { MemoryViewer } from "./MemoryViewer";

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

describe("MemoryViewer", () => {
  it("shows loading while fetching", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryViewer agentId="a1" />, { wrapper: wrapper(qc) });
    expect(screen.getByText("Loading memories...")).toBeInTheDocument();
  });

  it("shows empty state when no memories", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryViewer agentId="a1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No memories stored.")).toBeInTheDocument();
  });

  it("renders memory keys", async () => {
    const memories = [
      { id: "m1", agentId: "a1", key: "context", value: "some value", updatedAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(memories));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryViewer agentId="a1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("context")).toBeInTheDocument();
  });

  it("expands memory on click to show value", async () => {
    const memories = [
      { id: "m1", agentId: "a1", key: "my-key", value: "my-value", updatedAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(memories));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryViewer agentId="a1" />, { wrapper: wrapper(qc) });

    await screen.findByText("my-key");
    fireEvent.click(screen.getByText("my-key").closest("div")!);
    expect(screen.getByText("my-value")).toBeInTheDocument();
  });

  it("collapses memory on second click", async () => {
    const memories = [
      { id: "m1", agentId: "a1", key: "my-key", value: "my-value", updatedAt: new Date().toISOString() },
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(memories));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryViewer agentId="a1" />, { wrapper: wrapper(qc) });

    await screen.findByText("my-key");
    const row = screen.getByText("my-key").closest("div")!;
    fireEvent.click(row);
    expect(screen.getByText("my-value")).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.queryByText("my-value")).not.toBeInTheDocument();
  });

  it("calls delete mutation when Delete button is clicked", async () => {
    const memories = [
      { id: "m1", agentId: "a1", key: "ctx", value: "data", updatedAt: new Date().toISOString() },
    ];
    // first call is memories fetch, second is delete
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeFetchOk(memories))
      .mockResolvedValue(makeFetchOk({}));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryViewer agentId="a1" />, { wrapper: wrapper(qc) });

    await screen.findByText("ctx");
    fireEvent.click(screen.getByText("ctx").closest("div")!);
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/agents/a1/memories/m1",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });
});
