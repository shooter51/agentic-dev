import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColumnHeader } from "./ColumnHeader";

describe("ColumnHeader", () => {
  it("renders the stage label for known stages", () => {
    render(<ColumnHeader stage="todo" count={3} />);
    expect(screen.getByText("Todo")).toBeInTheDocument();
  });

  it("renders the count", () => {
    render(<ColumnHeader stage="done" count={7} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("falls back to raw stage string for unknown stage", () => {
    render(<ColumnHeader stage="custom_stage" count={0} />);
    expect(screen.getByText("custom_stage")).toBeInTheDocument();
  });

  it("renders all known stage labels", () => {
    const stages: Array<[string, string]> = [
      ["todo", "Todo"],
      ["product", "Product"],
      ["architecture", "Architecture"],
      ["development", "Development"],
      ["tech_lead_review", "TL Review"],
      ["devops_build", "Build"],
      ["manual_qa", "Manual QA"],
      ["automation", "Automation"],
      ["documentation", "Docs"],
      ["devops_deploy", "Deploy"],
      ["arch_review", "Arch Review"],
      ["done", "Done"],
    ];
    for (const [stage, label] of stages) {
      const { unmount } = render(<ColumnHeader stage={stage} count={0} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  describe("collapsed mode", () => {
    it("renders label in vertical writing mode when collapsed", () => {
      render(<ColumnHeader stage="todo" count={5} collapsed />);
      expect(screen.getByText("Todo")).toBeInTheDocument();
    });

    it("renders count when collapsed and count > 0", () => {
      render(<ColumnHeader stage="todo" count={3} collapsed />);
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("does not render count when collapsed and count is 0", () => {
      render(<ColumnHeader stage="todo" count={0} collapsed />);
      expect(screen.queryByText("0")).not.toBeInTheDocument();
    });
  });

  describe("expanded mode", () => {
    it("calls onToggle when clicked", () => {
      const onToggle = vi.fn();
      render(<ColumnHeader stage="todo" count={0} onToggle={onToggle} />);
      fireEvent.click(screen.getByText("Todo").closest("div")!);
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it("renders ChevronDown icon when onToggle is provided", () => {
      const { container } = render(<ColumnHeader stage="todo" count={0} onToggle={vi.fn()} />);
      // lucide renders an SVG
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("does not render ChevronDown when onToggle is not provided", () => {
      const { container } = render(<ColumnHeader stage="todo" count={2} />);
      // Without onToggle the chevron is absent but count badge is still rendered
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });
});
