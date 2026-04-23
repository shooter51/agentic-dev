import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StageBadge } from "./StageBadge";

describe("StageBadge", () => {
  const cases: Array<[string, string]> = [
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

  it.each(cases)('renders label "%s" for stage "%s"', (stage, label) => {
    render(<StageBadge stage={stage} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("falls back to the raw stage value for unknown stages", () => {
    render(<StageBadge stage="unknown_stage" />);
    expect(screen.getByText("unknown_stage")).toBeInTheDocument();
  });

  it("applies additional className prop", () => {
    const { container } = render(<StageBadge stage="done" className="my-class" />);
    expect(container.firstChild).toHaveClass("my-class");
  });

  it("renders a span element", () => {
    const { container } = render(<StageBadge stage="todo" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });
});
