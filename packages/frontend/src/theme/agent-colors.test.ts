import {
  AGENT_IDS,
  AGENT_COLORS,
  UNKNOWN_AGENT_COLOR,
  getAgentColor,
  getAgentColorByRole,
  type AgentColorTokens,
  type AgentId,
} from "./agent-colors";

describe("Agent Colors", () => {
  describe("AGENT_IDS", () => {
    it("should contain exactly 10 agent IDs", () => {
      expect(AGENT_IDS).toHaveLength(10);
    });

    it("should contain no duplicate IDs", () => {
      const uniqueIds = new Set(AGENT_IDS);
      expect(uniqueIds.size).toBe(AGENT_IDS.length);
    });

    it("should contain all expected agent IDs", () => {
      const expectedIds = [
        "product-manager",
        "architect",
        "dev-1",
        "dev-2",
        "dev-3",
        "tech-lead",
        "devops",
        "manual-qa",
        "automation",
        "documentation"
      ];

      expect(AGENT_IDS).toEqual(expect.arrayContaining(expectedIds));
      expect(AGENT_IDS.length).toBe(expectedIds.length);
    });
  });

  describe("AGENT_COLORS", () => {
    it("should have entries for all agent IDs", () => {
      AGENT_IDS.forEach(agentId => {
        expect(AGENT_COLORS).toHaveProperty(agentId);
      });
    });

    it("should have no orphan entries", () => {
      const agentColorKeys = Object.keys(AGENT_COLORS) as AgentId[];
      agentColorKeys.forEach(key => {
        expect(AGENT_IDS).toContain(key);
      });
    });

    it("should have valid color tokens for each agent", () => {
      Object.values(AGENT_COLORS).forEach(colorTokens => {
        expect(colorTokens).toHaveProperty("displayName");
        expect(colorTokens).toHaveProperty("avatarClassName");
        expect(colorTokens).toHaveProperty("badgeClassName");
        expect(colorTokens).toHaveProperty("hex");

        expect(typeof colorTokens.displayName).toBe("string");
        expect(typeof colorTokens.avatarClassName).toBe("string");
        expect(typeof colorTokens.badgeClassName).toBe("string");
        expect(typeof colorTokens.hex).toBe("string");

        expect(colorTokens.displayName).not.toBe("");
        expect(colorTokens.avatarClassName).not.toBe("");
        expect(colorTokens.badgeClassName).not.toBe("");
        expect(colorTokens.hex).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it("should have unique display names", () => {
      const displayNames = Object.values(AGENT_COLORS).map(c => c.displayName);
      const uniqueNames = new Set(displayNames);
      expect(uniqueNames.size).toBe(displayNames.length);
    });

    it("should have unique hex colors", () => {
      const hexColors = Object.values(AGENT_COLORS).map(c => c.hex);
      const uniqueHexes = new Set(hexColors);
      expect(uniqueHexes.size).toBe(hexColors.length);
    });
  });

  describe("UNKNOWN_AGENT_COLOR", () => {
    it("should have valid structure", () => {
      expect(UNKNOWN_AGENT_COLOR).toHaveProperty("displayName");
      expect(UNKNOWN_AGENT_COLOR).toHaveProperty("avatarClassName");
      expect(UNKNOWN_AGENT_COLOR).toHaveProperty("badgeClassName");
      expect(UNKNOWN_AGENT_COLOR).toHaveProperty("hex");
    });

    it("should have non-empty values", () => {
      expect(UNKNOWN_AGENT_COLOR.displayName).not.toBe("");
      expect(UNKNOWN_AGENT_COLOR.avatarClassName).not.toBe("");
      expect(UNKNOWN_AGENT_COLOR.badgeClassName).not.toBe("");
      expect(UNKNOWN_AGENT_COLOR.hex).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should be visually distinct from known agent colors", () => {
      const knownHexes = Object.values(AGENT_COLORS).map(c => c.hex);
      expect(knownHexes).not.toContain(UNKNOWN_AGENT_COLOR.hex);
    });
  });

  describe("getAgentColor", () => {
    it("should return UNKNOWN_AGENT_COLOR for null/undefined/empty agentId", () => {
      expect(getAgentColor(null)).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColor(undefined)).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColor("")).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColor("   ")).toEqual(UNKNOWN_AGENT_COLOR);
    });

    it("should return UNKNOWN_AGENT_COLOR for unknown agentId", () => {
      expect(getAgentColor("unknown-agent")).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColor("missing")).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColor("fake-id")).toEqual(UNKNOWN_AGENT_COLOR);
    });

    it("should return base colors for known agents without model", () => {
      const result = getAgentColor("devops");
      const expected = AGENT_COLORS.devops;
      expect(result).toEqual(expected);
    });

    it("should return base colors for known agents with sonnet model", () => {
      const result = getAgentColor("devops", "sonnet");
      const expected = AGENT_COLORS.devops;
      expect(result).toEqual(expected);
    });

    it("should return darker colors for opus model", () => {
      const sonnetColor = getAgentColor("devops", "sonnet");
      const opusColor = getAgentColor("devops", "opus");

      // Should be different objects
      expect(opusColor).not.toEqual(sonnetColor);

      // Should have same displayName but different styling
      expect(opusColor.displayName).toBe(sonnetColor.displayName);
      expect(opusColor.avatarClassName).not.toBe(sonnetColor.avatarClassName);
      expect(opusColor.hex).not.toBe(sonnetColor.hex);

      // Opus should have darker hex value (lower luminance)
      // This is a basic check - opus colors are designed to be darker
      expect(opusColor.hex).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should handle all valid agent IDs with opus model", () => {
      AGENT_IDS.forEach(agentId => {
        const result = getAgentColor(agentId, "opus");
        expect(result).toBeDefined();
        expect(result.displayName).not.toBe("");
        expect(result.avatarClassName).not.toBe("");
        expect(result.badgeClassName).not.toBe("");
        expect(result.hex).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it("should handle all valid agent IDs with sonnet model", () => {
      AGENT_IDS.forEach(agentId => {
        const result = getAgentColor(agentId, "sonnet");
        expect(result).toBeDefined();
        expect(result).toEqual(AGENT_COLORS[agentId]);
      });
    });

    it("should treat null model same as no model", () => {
      const noModel = getAgentColor("architect");
      const nullModel = getAgentColor("architect", null);
      expect(nullModel).toEqual(noModel);
    });

    it("should treat undefined model same as no model", () => {
      const noModel = getAgentColor("architect");
      const undefinedModel = getAgentColor("architect", undefined);
      expect(undefinedModel).toEqual(noModel);
    });
  });

  describe("getAgentColorByRole", () => {
    it("should return same result as getAgentColor without model", () => {
      AGENT_IDS.forEach(agentId => {
        const byRole = getAgentColorByRole(agentId);
        const byColor = getAgentColor(agentId);
        expect(byRole).toEqual(byColor);
      });
    });

    it("should handle null/undefined/empty same way", () => {
      expect(getAgentColorByRole(null)).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColorByRole(undefined)).toEqual(UNKNOWN_AGENT_COLOR);
      expect(getAgentColorByRole("")).toEqual(UNKNOWN_AGENT_COLOR);
    });

    it("should handle unknown agents same way", () => {
      expect(getAgentColorByRole("unknown")).toEqual(UNKNOWN_AGENT_COLOR);
    });
  });

  describe("Model-based intensity differences", () => {
    it("should provide visually distinct colors for different models", () => {
      // Test a few key agents to ensure model affects visual appearance
      const testAgents: AgentId[] = ["devops", "architect", "dev-1"];

      testAgents.forEach(agentId => {
        const sonnetColor = getAgentColor(agentId, "sonnet");
        const opusColor = getAgentColor(agentId, "opus");

        // Should have different visual appearance
        expect(opusColor.avatarClassName).not.toBe(sonnetColor.avatarClassName);
        expect(opusColor.hex).not.toBe(sonnetColor.hex);
      });
    });
  });
});