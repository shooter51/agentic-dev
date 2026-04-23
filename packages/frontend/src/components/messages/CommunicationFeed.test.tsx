import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { CommunicationFeed } from "./CommunicationFeed";
import type { Message } from "@/api/types";

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

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    taskId: "t1",
    type: "notification",
    content: "Hello",
    status: "resolved",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CommunicationFeed", () => {
  it("renders 'No messages yet.' when there are no messages", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
  });

  it("renders filter buttons", () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Clarifications")).toBeInTheDocument();
    expect(screen.getByText("Rejections")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Responses")).toBeInTheDocument();
  });

  it("renders a message when data is returned", async () => {
    const messages = [makeMsg({ content: "Test message content" })];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(messages));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Test message content")).toBeInTheDocument();
  });

  it("filters messages when a filter button is clicked", async () => {
    const messages = [
      makeMsg({ id: "m1", type: "notification", content: "Notif msg" }),
      makeMsg({ id: "m2", type: "clarification", content: "Clarif msg" }),
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(messages));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });

    await screen.findByText("Notif msg");
    fireEvent.click(screen.getByText("Clarifications"));
    expect(screen.queryByText("Notif msg")).not.toBeInTheDocument();
    expect(screen.getByText("Clarif msg")).toBeInTheDocument();
  });

  it("renders Send input and button when taskId is provided", () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });
    expect(screen.getByPlaceholderText("Send a message to the agent...")).toBeInTheDocument();
    // Send button exists (contains text "Send")
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("does not render Send input when taskId is not provided", () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed />, { wrapper: wrapper(qc) });
    expect(screen.queryByPlaceholderText("Send a message to the agent...")).not.toBeInTheDocument();
  });

  it("sends a message via POST when Send is clicked", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });

    const input = screen.getByPlaceholderText("Send a message to the agent...");
    fireEvent.change(input, { target: { value: "My message" } });

    // reset mock so we can isolate the send call
    vi.mocked(fetch).mockResolvedValue(makeFetchOk({ id: "new-msg", content: "My message" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/tasks/t1/messages",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("sends message on Enter key press", async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchOk([]));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });

    const input = screen.getByPlaceholderText("Send a message to the agent...");
    fireEvent.change(input, { target: { value: "Enter message" } });

    vi.mocked(fetch).mockResolvedValue(makeFetchOk({}));
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/tasks/t1/messages",
        expect.objectContaining({ method: "POST" })
      )
    );
  });

  it("groups threaded messages together", async () => {
    const messages = [
      makeMsg({ id: "m1", threadId: "thread-1", content: "Thread msg 1" }),
      makeMsg({ id: "m2", threadId: "thread-1", content: "Thread msg 2" }),
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(messages));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });
    expect(await screen.findByText("Thread msg 1")).toBeInTheDocument();
    expect(screen.getByText("Thread msg 2")).toBeInTheDocument();
  });

  it("renders pending messages with their content", async () => {
    const messages = [
      makeMsg({ id: "m1", status: "pending", content: "Pending msg", type: "clarification" }),
    ];
    vi.mocked(fetch).mockResolvedValue(makeFetchOk(messages));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CommunicationFeed taskId="t1" />, { wrapper: wrapper(qc) });
    // Pending messages are rendered via groupIntoThreads as standalone threads
    expect(await screen.findByText("Pending msg")).toBeInTheDocument();
  });
});
