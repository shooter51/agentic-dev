import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/api/types";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    taskId: "t1",
    type: "notification",
    content: "Hello world",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MessageBubble", () => {
  it("renders message content", () => {
    render(<MessageBubble message={makeMessage({ content: "Test message" })} />);
    expect(screen.getByText("Test message")).toBeInTheDocument();
  });

  it('shows "Operator" when fromAgent is not set', () => {
    render(<MessageBubble message={makeMessage({ fromAgent: undefined })} />);
    expect(screen.getByText("Operator")).toBeInTheDocument();
  });

  it("shows fromAgent name when set", () => {
    render(<MessageBubble message={makeMessage({ fromAgent: "dev-bot" })} />);
    expect(screen.getByText("dev-bot")).toBeInTheDocument();
    // Avatar with title
    expect(screen.getByTitle("dev-bot")).toBeInTheDocument();
  });

  it("shows toAgent name with arrow when set", () => {
    render(<MessageBubble message={makeMessage({ fromAgent: "bot-a", toAgent: "bot-b" })} />);
    expect(screen.getByText("bot-b")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
  });

  it("applies clarification type styles", () => {
    const { container } = render(<MessageBubble message={makeMessage({ type: "clarification" })} />);
    expect(container.firstChild).toHaveClass("bg-blue-50");
  });

  it("applies rejection type styles", () => {
    const { container } = render(<MessageBubble message={makeMessage({ type: "rejection" })} />);
    expect(container.firstChild).toHaveClass("bg-red-50");
  });

  it("applies notification type styles", () => {
    const { container } = render(<MessageBubble message={makeMessage({ type: "notification" })} />);
    expect(container.firstChild).toHaveClass("bg-gray-50");
  });

  it("applies response type styles", () => {
    const { container } = render(<MessageBubble message={makeMessage({ type: "response" })} />);
    expect(container.firstChild).toHaveClass("bg-green-50");
  });

  it("applies additional className prop", () => {
    const { container } = render(<MessageBubble message={makeMessage()} className="extra" />);
    expect(container.firstChild).toHaveClass("extra");
  });
});
