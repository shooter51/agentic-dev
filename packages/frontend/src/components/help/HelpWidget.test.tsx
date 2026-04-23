import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { HelpWidget } from "./HelpWidget";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, {}, children);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HelpWidget", () => {
  it("renders the floating help button", () => {
    render(<HelpWidget />, { wrapper });
    expect(screen.getByLabelText("Help")).toBeInTheDocument();
  });

  it("does not show chat panel by default", () => {
    render(<HelpWidget />, { wrapper });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens chat panel when help button is clicked", () => {
    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Agentic Dev Help")).toBeInTheDocument();
  });

  it("shows empty prompt text when no messages", () => {
    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));
    expect(screen.getByText("Ask me anything about Agentic Dev!")).toBeInTheDocument();
  });

  it("closes chat panel when close button is clicked", () => {
    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));
    fireEvent.click(screen.getByLabelText("Close help"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  function getSendButton() {
    // The Send button contains only a lucide Send SVG icon, no text
    // It is the last button inside the chat panel footer
    const buttons = screen.getAllByRole("button");
    // The send button is inside the chat panel footer (after help open button and close button)
    return buttons[buttons.length - 1];
  }

  it("sends a message on Send button click and shows user message", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answer: "Here is the answer",
          navigationHints: [],
          citedArticles: [],
        }),
    } as Response);

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "How do I create a task?" } });
    fireEvent.click(getSendButton());

    expect(screen.getByText("How do I create a task?")).toBeInTheDocument();
    expect(await screen.findByText("Here is the answer")).toBeInTheDocument();
  });

  it("sends a message on Enter key", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ answer: "Answer!", navigationHints: [], citedArticles: [] }),
    } as Response);

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "Help me" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Answer!")).toBeInTheDocument();
  });

  it("closes chat on Escape key", () => {
    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows error when fetch fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "Question" } });
    fireEvent.click(getSendButton());

    expect(await screen.findByText(/Help request failed/)).toBeInTheDocument();
  });

  it("shows loading dots while fetching (send button becomes disabled)", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "Question" } });
    const sendBtn = getSendButton();
    fireEvent.click(sendBtn);

    // The send button should be disabled while loading
    await waitFor(() => {
      expect(sendBtn).toBeDisabled();
    });

    // Resolve to avoid unhandled promise
    resolveFetch({ ok: true, json: () => Promise.resolve({ answer: "A", navigationHints: [], citedArticles: [] }) } as Response);
  });

  it("renders navigation hint buttons and clicking them closes the panel", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answer: "Go to board",
          navigationHints: [{ key: "board", label: "Board", path: "/" }],
          citedArticles: [],
        }),
    } as Response);

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "Where is the board?" } });
    fireEvent.click(getSendButton());

    const hint = await screen.findByText("Take me to: Board");
    expect(hint).toBeInTheDocument();

    // Clicking the navigation hint should close the panel (calls navigate + setOpen(false))
    fireEvent.click(hint);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders cited articles when provided", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answer: "See docs",
          navigationHints: [],
          citedArticles: ["doc-1.md", "doc-2.md"],
        }),
    } as Response);

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "Docs?" } });
    fireEvent.click(getSendButton());

    expect(await screen.findByText("Sources: doc-1.md, doc-2.md")).toBeInTheDocument();
  });

  it("shows generic error message when non-Error is thrown", async () => {
    vi.mocked(fetch).mockRejectedValue("string error");

    render(<HelpWidget />, { wrapper });
    fireEvent.click(screen.getByLabelText("Help"));

    const input = screen.getByPlaceholderText("Type your question...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(getSendButton());

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
