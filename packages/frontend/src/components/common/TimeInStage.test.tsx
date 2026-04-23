import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeInStage } from "./TimeInStage";

// Fix Date.now so elapsed time is predictable
const NOW = new Date("2024-06-01T12:00:00.000Z").getTime();

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWithNow(updatedAt: string) {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  return render(<TimeInStage updatedAt={updatedAt} />);
}

describe("TimeInStage", () => {
  it('displays "just now" when under 1 minute ago', () => {
    const updatedAt = new Date(NOW - 30_000).toISOString(); // 30 seconds ago
    renderWithNow(updatedAt);
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("displays minutes when between 1 and 59 minutes ago", () => {
    const updatedAt = new Date(NOW - 45 * 60_000).toISOString(); // 45 minutes ago
    renderWithNow(updatedAt);
    expect(screen.getByText("45m")).toBeInTheDocument();
  });

  it("displays hours when between 1 and 23 hours ago", () => {
    const updatedAt = new Date(NOW - 3 * 60 * 60_000).toISOString(); // 3 hours ago
    renderWithNow(updatedAt);
    expect(screen.getByText("3h")).toBeInTheDocument();
  });

  it("displays days when 1 or more days ago", () => {
    const updatedAt = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString(); // 2 days ago
    renderWithNow(updatedAt);
    expect(screen.getByText("2d")).toBeInTheDocument();
  });

  it("applies orange class when elapsed > 1 day (stale)", () => {
    const updatedAt = new Date(NOW - 2 * 24 * 60 * 60_000).toISOString();
    renderWithNow(updatedAt);
    expect(screen.getByText("2d")).toHaveClass("text-orange-500");
  });

  it("applies gray class when elapsed <= 1 day (fresh)", () => {
    const updatedAt = new Date(NOW - 30 * 60_000).toISOString(); // 30 minutes ago
    renderWithNow(updatedAt);
    expect(screen.getByText("30m")).toHaveClass("text-gray-400");
  });

  it("accepts a custom className and overrides the default", () => {
    const updatedAt = new Date(NOW - 60_000).toISOString();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    render(<TimeInStage updatedAt={updatedAt} className="custom-class" />);
    expect(screen.getByText("1m")).toHaveClass("custom-class");
  });

  it("renders a title attribute with the formatted date", () => {
    const updatedAt = new Date(NOW - 60_000).toISOString();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    render(<TimeInStage updatedAt={updatedAt} />);
    const el = screen.getByText("1m");
    expect(el).toHaveAttribute("title");
    expect(el.getAttribute("title")).not.toBe("");
  });
});
