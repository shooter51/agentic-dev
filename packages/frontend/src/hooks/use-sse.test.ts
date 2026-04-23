import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSSE } from "./use-sse";
import { useUIStore } from "../stores/ui-store";

// Mock EventSource globally
class MockEventSource {
  url: string;
  listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map();
  onerror: (() => void) | null = null;
  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...existing, handler]);
  }

  close = vi.fn();

  emit(event: string, data: unknown) {
    const handlers = this.listeners.get(event) ?? [];
    const msgEvent = { data: JSON.stringify(data) } as MessageEvent;
    handlers.forEach((h) => h(msgEvent));
  }
}

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  useUIStore.setState({
    selectedProject: null,
    selectedTask: null,
    sidebarOpen: true,
    compactMode: false,
    isDragging: false,
    draggedTaskId: null,
    dragEventQueue: [],
    activeFilters: { agents: [], priorities: [], types: [] },
    collapsedColumns: new Set(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSSE", () => {
  it("creates an EventSource connected to /api/events", () => {
    const qc = new QueryClient();
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/events");
  });

  it("closes the EventSource on unmount", () => {
    const qc = new QueryClient();
    const { unmount } = renderHook(() => useSSE(), { wrapper: wrapper(qc) });
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.close).toHaveBeenCalledOnce();
  });

  it("invalidates query keys when a task-updated event fires", () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });

    const es = MockEventSource.instances[0];
    es.emit("task-updated", { taskId: "t1", projectId: "proj-1" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tasks", "t1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["board", "proj-1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["task-history", "t1"] });
  });

  it("queues task-updated events when dragging instead of invalidating", () => {
    useUIStore.setState({ isDragging: true });

    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });

    const es = MockEventSource.instances[0];
    es.emit("task-updated", { taskId: "t1" });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(useUIStore.getState().dragEventQueue).toHaveLength(1);
    expect(useUIStore.getState().dragEventQueue[0].eventName).toBe("task-updated");
  });

  it("does NOT queue non-task-updated events during drag", () => {
    useUIStore.setState({ isDragging: true });

    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });

    const es = MockEventSource.instances[0];
    es.emit("agent-status", { agentId: "a1" });

    expect(invalidateSpy).toHaveBeenCalled();
    expect(useUIStore.getState().dragEventQueue).toHaveLength(0);
  });

  it("invalidates all queries on full-sync event", () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });

    const es = MockEventSource.instances[0];
    // full-sync listener is attached — simulate it
    const fullSyncHandlers = es.listeners.get("full-sync") ?? [];
    expect(fullSyncHandlers).toHaveLength(1);
    fullSyncHandlers[0]({} as MessageEvent);

    expect(invalidateSpy).toHaveBeenCalledWith();
  });

  it("registers an onerror handler", () => {
    const qc = new QueryClient();
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });
    const es = MockEventSource.instances[0];
    expect(es.onerror).toBeTypeOf("function");
  });

  it("registers listeners for all SSE_QUERY_MAP event names", () => {
    const qc = new QueryClient();
    renderHook(() => useSSE(), { wrapper: wrapper(qc) });
    const es = MockEventSource.instances[0];
    const expectedEvents = [
      "task-updated",
      "agent-status",
      "new-message",
      "message-response",
      "handoff",
      "quality-gate",
      "defect-created",
      "agent-error",
      "full-sync",
    ];
    for (const event of expectedEvents) {
      expect(es.listeners.has(event)).toBe(true);
    }
  });
});
