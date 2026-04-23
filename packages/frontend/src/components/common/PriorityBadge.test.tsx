import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriorityBadge } from "./PriorityBadge";

describe("PriorityBadge", () => {
  it("renders P0 label", () => {
    render(<PriorityBadge priority="P0" />);
    expect(screen.getByText("P0")).toBeInTheDocument();
  });

  it("renders P1 label", () => {
    render(<PriorityBadge priority="P1" />);
    expect(screen.getByText("P1")).toBeInTheDocument();
  });

  it("renders P2 label", () => {
    render(<PriorityBadge priority="P2" />);
    expect(screen.getByText("P2")).toBeInTheDocument();
  });

  it("renders P3 label", () => {
    render(<PriorityBadge priority="P3" />);
    expect(screen.getByText("P3")).toBeInTheDocument();
  });

  it("renders P4 label", () => {
    render(<PriorityBadge priority="P4" />);
    expect(screen.getByText("P4")).toBeInTheDocument();
  });

  it("applies additional className prop", () => {
    const { container } = render(<PriorityBadge priority="P2" className="extra-class" />);
    expect(container.firstChild).toHaveClass("extra-class");
  });

  it("P0 badge has red background class", () => {
    const { container } = render(<PriorityBadge priority="P0" />);
    expect(container.firstChild).toHaveClass("bg-red-600");
  });

  it("P1 badge has orange background class", () => {
    const { container } = render(<PriorityBadge priority="P1" />);
    expect(container.firstChild).toHaveClass("bg-orange-500");
  });

  it("P2 badge has yellow background class", () => {
    const { container } = render(<PriorityBadge priority="P2" />);
    expect(container.firstChild).toHaveClass("bg-yellow-500");
  });

  it("P3 badge has blue background class", () => {
    const { container } = render(<PriorityBadge priority="P3" />);
    expect(container.firstChild).toHaveClass("bg-blue-500");
  });

  it("P4 badge has gray background class", () => {
    const { container } = render(<PriorityBadge priority="P4" />);
    expect(container.firstChild).toHaveClass("bg-gray-400");
  });

  it("renders a span element", () => {
    const { container } = render(<PriorityBadge priority="P2" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });
});
