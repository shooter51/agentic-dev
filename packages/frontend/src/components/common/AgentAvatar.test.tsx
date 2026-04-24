import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentAvatar } from "./AgentAvatar";

describe("AgentAvatar", () => {
  describe("basic functionality", () => {
    it("renders with basic props", () => {
      const { container } = render(<AgentAvatar agentId="devops" />);
      expect(container.firstChild).toBeInTheDocument();
      expect(container.firstChild).toHaveClass("inline-flex", "items-center", "justify-center", "rounded-full");
    });

    it("includes agentId and displayName in title", () => {
      render(<AgentAvatar agentId="devops" />);
      const avatar = screen.getByTitle(/DevOps \(devops\)/);
      expect(avatar).toBeInTheDocument();
    });

    it("includes model in title when provided", () => {
      render(<AgentAvatar agentId="devops" model="opus" />);
      const avatar = screen.getByTitle(/DevOps \(devops\) - opus/);
      expect(avatar).toBeInTheDocument();
    });

    it("uses unknown agent color for invalid agentId", () => {
      const { container } = render(<AgentAvatar agentId="unknown-agent" />);
      expect(container.firstChild).toHaveClass("bg-gray-100", "text-gray-500");
    });

    it("uses unknown agent color for null agentId", () => {
      const { container } = render(<AgentAvatar agentId={null as any} />);
      expect(container.firstChild).toHaveClass("bg-gray-100", "text-gray-500");
    });
  });

  describe("model-aware colors", () => {
    it("uses lighter colors for sonnet model", () => {
      const { container } = render(<AgentAvatar agentId="devops" model="sonnet" />);
      // Sonnet uses the base/light colors (100 background)
      expect(container.firstChild).toHaveClass("bg-orange-100", "text-orange-700");
    });

    it("uses darker colors for opus model", () => {
      const { container } = render(<AgentAvatar agentId="devops" model="opus" />);
      // Opus uses the dark colors (900 background)
      expect(container.firstChild).toHaveClass("bg-orange-900", "text-orange-200");
    });

    it("uses base colors when no model is provided", () => {
      const { container } = render(<AgentAvatar agentId="devops" />);
      // No model defaults to sonnet/base colors (100 background)
      expect(container.firstChild).toHaveClass("bg-orange-100", "text-orange-700");
    });

    it("uses base colors for null model", () => {
      const { container } = render(<AgentAvatar agentId="devops" model={null} />);
      expect(container.firstChild).toHaveClass("bg-orange-100", "text-orange-700");
    });
  });

  describe("role-based colors", () => {
    it("uses purple colors for product-manager", () => {
      const { container } = render(<AgentAvatar agentId="product-manager" />);
      expect(container.firstChild).toHaveClass("bg-purple-100", "text-purple-700");
    });

    it("uses blue colors for architect", () => {
      const { container } = render(<AgentAvatar agentId="architect" />);
      expect(container.firstChild).toHaveClass("bg-blue-100", "text-blue-700");
    });

    it("uses green colors for dev-1", () => {
      const { container } = render(<AgentAvatar agentId="dev-1" />);
      expect(container.firstChild).toHaveClass("bg-green-100", "text-green-700");
    });

    it("uses emerald colors for dev-2", () => {
      const { container } = render(<AgentAvatar agentId="dev-2" />);
      expect(container.firstChild).toHaveClass("bg-emerald-100", "text-emerald-700");
    });

    it("uses teal colors for dev-3", () => {
      const { container } = render(<AgentAvatar agentId="dev-3" />);
      expect(container.firstChild).toHaveClass("bg-teal-100", "text-teal-700");
    });

    it("uses cyan colors for tech-lead", () => {
      const { container } = render(<AgentAvatar agentId="tech-lead" />);
      expect(container.firstChild).toHaveClass("bg-cyan-100", "text-cyan-700");
    });

    it("uses amber colors for manual-qa", () => {
      const { container } = render(<AgentAvatar agentId="manual-qa" />);
      expect(container.firstChild).toHaveClass("bg-amber-100", "text-amber-700");
    });

    it("uses rose colors for automation", () => {
      const { container } = render(<AgentAvatar agentId="automation" />);
      expect(container.firstChild).toHaveClass("bg-rose-100", "text-rose-700");
    });

    it("uses indigo colors for documentation", () => {
      const { container } = render(<AgentAvatar agentId="documentation" />);
      expect(container.firstChild).toHaveClass("bg-indigo-100", "text-indigo-700");
    });
  });

  describe("model intensity variations", () => {
    it("shows different colors for same agent with different models", () => {
      const { container: sonnetContainer } = render(<AgentAvatar agentId="architect" model="sonnet" />);
      const { container: opusContainer } = render(<AgentAvatar agentId="architect" model="opus" />);

      // Sonnet should use light colors
      expect(sonnetContainer.firstChild).toHaveClass("bg-blue-100", "text-blue-700");

      // Opus should use dark colors
      expect(opusContainer.firstChild).toHaveClass("bg-blue-900", "text-blue-200");
    });
  });

  describe("icon selection", () => {
    it("uses appropriate icon for agent roles", () => {
      const { container } = render(<AgentAvatar agentId="devops" />);
      // Devops should use Rocket icon - check for SVG presence
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("applies sm size classes", () => {
      const { container } = render(<AgentAvatar agentId="devops" size="sm" />);
      expect(container.firstChild).toHaveClass("w-5", "h-5");
    });

    it("applies md size classes (default)", () => {
      const { container } = render(<AgentAvatar agentId="devops" />);
      expect(container.firstChild).toHaveClass("w-7", "h-7");
    });

    it("applies lg size classes", () => {
      const { container } = render(<AgentAvatar agentId="devops" size="lg" />);
      expect(container.firstChild).toHaveClass("w-9", "h-9");
    });
  });

  describe("role inference for backwards compatibility", () => {
    it("infers devops icon from agentId containing 'devops'", () => {
      const { container } = render(<AgentAvatar agentId="devops-agent" />);
      expect(container.firstChild).toHaveClass("bg-gray-100"); // Unknown ID falls back to gray
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument(); // Should still have an icon via inference
    });

    it("infers developer icon from agentId containing 'dev'", () => {
      const { container } = render(<AgentAvatar agentId="developer-agent" />);
      expect(container.firstChild).toHaveClass("bg-gray-100"); // Unknown ID falls back to gray
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument(); // Should still have an icon via inference
    });
  });

  describe("custom className", () => {
    it("applies additional className prop", () => {
      const { container } = render(<AgentAvatar agentId="devops" className="extra-class" />);
      expect(container.firstChild).toHaveClass("extra-class");
    });
  });
});
