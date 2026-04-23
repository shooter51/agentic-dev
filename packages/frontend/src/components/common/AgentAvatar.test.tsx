import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentAvatar } from "./AgentAvatar";

describe("AgentAvatar", () => {
  it("renders a span with the agentId as title", () => {
    render(<AgentAvatar agentId="my-agent" />);
    expect(screen.getByTitle("my-agent")).toBeInTheDocument();
  });

  it("uses role prop to pick the correct color when provided", () => {
    const { container } = render(<AgentAvatar agentId="x" role="developer" />);
    expect(container.firstChild).toHaveClass("bg-green-100");
  });

  it("uses role prop 'product' → purple color", () => {
    const { container } = render(<AgentAvatar agentId="x" role="product" />);
    expect(container.firstChild).toHaveClass("bg-purple-100");
  });

  it("uses role prop 'architect' → blue color", () => {
    const { container } = render(<AgentAvatar agentId="x" role="architect" />);
    expect(container.firstChild).toHaveClass("bg-blue-100");
  });

  it("uses role prop 'tech_lead' → cyan color", () => {
    const { container } = render(<AgentAvatar agentId="x" role="tech_lead" />);
    expect(container.firstChild).toHaveClass("bg-cyan-100");
  });

  it("uses role prop 'qa' → yellow color", () => {
    const { container } = render(<AgentAvatar agentId="x" role="qa" />);
    expect(container.firstChild).toHaveClass("bg-yellow-100");
  });

  it("uses role prop 'devops' → orange color", () => {
    const { container } = render(<AgentAvatar agentId="x" role="devops" />);
    expect(container.firstChild).toHaveClass("bg-orange-100");
  });

  it("uses default (gray) for unknown role", () => {
    const { container } = render(<AgentAvatar agentId="x" role="unknown_role" />);
    expect(container.firstChild).toHaveClass("bg-gray-100");
  });

  describe("role inference from agentId", () => {
    it("infers 'product' from agentId containing 'product'", () => {
      const { container } = render(<AgentAvatar agentId="product-agent" />);
      expect(container.firstChild).toHaveClass("bg-purple-100");
    });

    it("infers 'architect' from agentId containing 'arch'", () => {
      const { container } = render(<AgentAvatar agentId="arch-agent" />);
      expect(container.firstChild).toHaveClass("bg-blue-100");
    });

    it("infers 'devops' from agentId containing 'devops'", () => {
      const { container } = render(<AgentAvatar agentId="devops-1" />);
      expect(container.firstChild).toHaveClass("bg-orange-100");
    });

    it("infers 'devops' from agentId containing 'deploy'", () => {
      const { container } = render(<AgentAvatar agentId="deploy-agent" />);
      expect(container.firstChild).toHaveClass("bg-orange-100");
    });

    it("infers 'developer' from agentId containing 'dev' (but not devops)", () => {
      const { container } = render(<AgentAvatar agentId="dev-1" />);
      expect(container.firstChild).toHaveClass("bg-green-100");
    });

    it("infers 'tech_lead' from agentId containing 'tech'", () => {
      const { container } = render(<AgentAvatar agentId="tech-lead-1" />);
      expect(container.firstChild).toHaveClass("bg-cyan-100");
    });

    it("infers 'qa' from agentId containing 'qa'", () => {
      const { container } = render(<AgentAvatar agentId="qa-bot" />);
      expect(container.firstChild).toHaveClass("bg-yellow-100");
    });

    it("infers 'qa' from agentId containing 'test'", () => {
      const { container } = render(<AgentAvatar agentId="test-runner" />);
      expect(container.firstChild).toHaveClass("bg-yellow-100");
    });

    it("falls back to default for unrecognised agentId", () => {
      const { container } = render(<AgentAvatar agentId="mystery-bot" />);
      expect(container.firstChild).toHaveClass("bg-gray-100");
    });
  });

  describe("size prop", () => {
    it("applies sm size classes", () => {
      const { container } = render(<AgentAvatar agentId="x" size="sm" />);
      expect(container.firstChild).toHaveClass("w-5", "h-5");
    });

    it("applies md size classes (default)", () => {
      const { container } = render(<AgentAvatar agentId="x" />);
      expect(container.firstChild).toHaveClass("w-7", "h-7");
    });

    it("applies lg size classes", () => {
      const { container } = render(<AgentAvatar agentId="x" size="lg" />);
      expect(container.firstChild).toHaveClass("w-9", "h-9");
    });
  });

  it("applies additional className prop", () => {
    const { container } = render(<AgentAvatar agentId="x" className="extra" />);
    expect(container.firstChild).toHaveClass("extra");
  });
});
