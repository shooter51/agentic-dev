/**
 * Agent color system based on role and model strength.
 * Follows ADR-0015 Agent Colour Coding decisions.
 *
 * Design principles:
 * - Each agent role has a distinct hue
 * - Model strength affects intensity (opus = darker, sonnet = lighter)
 * - WCAG AA compliant contrast ratios
 * - Light/dark theme support
 */

export type AgentModel = "opus" | "sonnet" | null | undefined;

export interface AgentColorTokens {
  displayName: string;
  avatarClassName: string;
  badgeClassName: string;
  hex: string;
}

/**
 * Agent IDs as defined in the pipeline stage-agent-map.
 * This list should be kept in sync with STAGE_AGENT_MAP.
 */
export const AGENT_IDS = [
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
] as const;

export type AgentId = typeof AGENT_IDS[number];

/**
 * Role-based color assignments with model-aware intensity.
 * Each role has light (sonnet) and dark (opus) variants with precomputed static classes.
 */
const ROLE_COLOR_MAP: Record<string, {
  hue: string;
  light: { bg: string; text: string; badge: string; hex: string };
  dark: { bg: string; text: string; badge: string; hex: string };
}> = {
  "product-manager": {
    hue: "purple",
    light: {
      bg: "bg-purple-100 dark:bg-purple-900",
      text: "text-purple-700 dark:text-purple-200",
      badge: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 border-purple-300 dark:border-purple-600",
      hex: "#7c3aed"
    },
    dark: {
      bg: "bg-purple-900 dark:bg-purple-200",
      text: "text-purple-200 dark:text-purple-900",
      badge: "bg-purple-900 dark:bg-purple-200 text-purple-200 dark:text-purple-900 border-purple-600 dark:border-purple-300",
      hex: "#581c87"
    },
  },
  "architect": {
    hue: "blue",
    light: {
      bg: "bg-blue-100 dark:bg-blue-900",
      text: "text-blue-700 dark:text-blue-200",
      badge: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border-blue-300 dark:border-blue-600",
      hex: "#2563eb"
    },
    dark: {
      bg: "bg-blue-900 dark:bg-blue-200",
      text: "text-blue-200 dark:text-blue-900",
      badge: "bg-blue-900 dark:bg-blue-200 text-blue-200 dark:text-blue-900 border-blue-600 dark:border-blue-300",
      hex: "#1e3a8a"
    },
  },
  "dev-1": {
    hue: "green",
    light: {
      bg: "bg-green-100 dark:bg-green-900",
      text: "text-green-700 dark:text-green-200",
      badge: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 border-green-300 dark:border-green-600",
      hex: "#16a34a"
    },
    dark: {
      bg: "bg-green-900 dark:bg-green-200",
      text: "text-green-200 dark:text-green-900",
      badge: "bg-green-900 dark:bg-green-200 text-green-200 dark:text-green-900 border-green-600 dark:border-green-300",
      hex: "#14532d"
    },
  },
  "dev-2": {
    hue: "emerald",
    light: {
      bg: "bg-emerald-100 dark:bg-emerald-900",
      text: "text-emerald-700 dark:text-emerald-200",
      badge: "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200 border-emerald-300 dark:border-emerald-600",
      hex: "#059669"
    },
    dark: {
      bg: "bg-emerald-900 dark:bg-emerald-200",
      text: "text-emerald-200 dark:text-emerald-900",
      badge: "bg-emerald-900 dark:bg-emerald-200 text-emerald-200 dark:text-emerald-900 border-emerald-600 dark:border-emerald-300",
      hex: "#064e3b"
    },
  },
  "dev-3": {
    hue: "teal",
    light: {
      bg: "bg-teal-100 dark:bg-teal-900",
      text: "text-teal-700 dark:text-teal-200",
      badge: "bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-200 border-teal-300 dark:border-teal-600",
      hex: "#0d9488"
    },
    dark: {
      bg: "bg-teal-900 dark:bg-teal-200",
      text: "text-teal-200 dark:text-teal-900",
      badge: "bg-teal-900 dark:bg-teal-200 text-teal-200 dark:text-teal-900 border-teal-600 dark:border-teal-300",
      hex: "#134e4a"
    },
  },
  "tech-lead": {
    hue: "cyan",
    light: {
      bg: "bg-cyan-100 dark:bg-cyan-900",
      text: "text-cyan-700 dark:text-cyan-200",
      badge: "bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-200 border-cyan-300 dark:border-cyan-600",
      hex: "#0891b2"
    },
    dark: {
      bg: "bg-cyan-900 dark:bg-cyan-200",
      text: "text-cyan-200 dark:text-cyan-900",
      badge: "bg-cyan-900 dark:bg-cyan-200 text-cyan-200 dark:text-cyan-900 border-cyan-600 dark:border-cyan-300",
      hex: "#164e63"
    },
  },
  "devops": {
    hue: "orange",
    light: {
      bg: "bg-orange-100 dark:bg-orange-900",
      text: "text-orange-700 dark:text-orange-200",
      badge: "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200 border-orange-300 dark:border-orange-600",
      hex: "#ea580c"
    },
    dark: {
      bg: "bg-orange-900 dark:bg-orange-200",
      text: "text-orange-200 dark:text-orange-900",
      badge: "bg-orange-900 dark:bg-orange-200 text-orange-200 dark:text-orange-900 border-orange-600 dark:border-orange-300",
      hex: "#9a3412"
    },
  },
  "manual-qa": {
    hue: "amber",
    light: {
      bg: "bg-amber-100 dark:bg-amber-900",
      text: "text-amber-700 dark:text-amber-200",
      badge: "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200 border-amber-300 dark:border-amber-600",
      hex: "#d97706"
    },
    dark: {
      bg: "bg-amber-900 dark:bg-amber-200",
      text: "text-amber-200 dark:text-amber-900",
      badge: "bg-amber-900 dark:bg-amber-200 text-amber-200 dark:text-amber-900 border-amber-600 dark:border-amber-300",
      hex: "#92400e"
    },
  },
  "automation": {
    hue: "rose",
    light: {
      bg: "bg-rose-100 dark:bg-rose-900",
      text: "text-rose-700 dark:text-rose-200",
      badge: "bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-200 border-rose-300 dark:border-rose-600",
      hex: "#e11d48"
    },
    dark: {
      bg: "bg-rose-900 dark:bg-rose-200",
      text: "text-rose-200 dark:text-rose-900",
      badge: "bg-rose-900 dark:bg-rose-200 text-rose-200 dark:text-rose-900 border-rose-600 dark:border-rose-300",
      hex: "#881337"
    },
  },
  "documentation": {
    hue: "indigo",
    light: {
      bg: "bg-indigo-100 dark:bg-indigo-900",
      text: "text-indigo-700 dark:text-indigo-200",
      badge: "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 border-indigo-300 dark:border-indigo-600",
      hex: "#4f46e5"
    },
    dark: {
      bg: "bg-indigo-900 dark:bg-indigo-200",
      text: "text-indigo-200 dark:text-indigo-900",
      badge: "bg-indigo-900 dark:bg-indigo-200 text-indigo-200 dark:text-indigo-900 border-indigo-600 dark:border-indigo-300",
      hex: "#312e81"
    },
  },
};

/**
 * Fallback color for unknown or missing agent IDs.
 * Uses gray with lower saturation to appear "weaker" than real agents.
 */
export const UNKNOWN_AGENT_COLOR: AgentColorTokens = {
  displayName: "Unknown Agent",
  avatarClassName: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  badgeClassName: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600",
  hex: "#6b7280",
};

/**
 * Main color mapping for all agents.
 * Maps agentId to color tokens with model-aware intensity (defaults to light/sonnet variant).
 */
export const AGENT_COLORS: Record<AgentId, AgentColorTokens> = {
  "product-manager": {
    displayName: "Product Manager",
    avatarClassName: `${ROLE_COLOR_MAP["product-manager"].light.bg} ${ROLE_COLOR_MAP["product-manager"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["product-manager"].light.badge,
    hex: ROLE_COLOR_MAP["product-manager"].light.hex,
  },
  architect: {
    displayName: "Architect",
    avatarClassName: `${ROLE_COLOR_MAP["architect"].light.bg} ${ROLE_COLOR_MAP["architect"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["architect"].light.badge,
    hex: ROLE_COLOR_MAP["architect"].light.hex,
  },
  "dev-1": {
    displayName: "Developer 1",
    avatarClassName: `${ROLE_COLOR_MAP["dev-1"].light.bg} ${ROLE_COLOR_MAP["dev-1"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["dev-1"].light.badge,
    hex: ROLE_COLOR_MAP["dev-1"].light.hex,
  },
  "dev-2": {
    displayName: "Developer 2",
    avatarClassName: `${ROLE_COLOR_MAP["dev-2"].light.bg} ${ROLE_COLOR_MAP["dev-2"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["dev-2"].light.badge,
    hex: ROLE_COLOR_MAP["dev-2"].light.hex,
  },
  "dev-3": {
    displayName: "Developer 3",
    avatarClassName: `${ROLE_COLOR_MAP["dev-3"].light.bg} ${ROLE_COLOR_MAP["dev-3"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["dev-3"].light.badge,
    hex: ROLE_COLOR_MAP["dev-3"].light.hex,
  },
  "tech-lead": {
    displayName: "Tech Lead",
    avatarClassName: `${ROLE_COLOR_MAP["tech-lead"].light.bg} ${ROLE_COLOR_MAP["tech-lead"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["tech-lead"].light.badge,
    hex: ROLE_COLOR_MAP["tech-lead"].light.hex,
  },
  devops: {
    displayName: "DevOps",
    avatarClassName: `${ROLE_COLOR_MAP["devops"].light.bg} ${ROLE_COLOR_MAP["devops"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["devops"].light.badge,
    hex: ROLE_COLOR_MAP["devops"].light.hex,
  },
  "manual-qa": {
    displayName: "Manual QA",
    avatarClassName: `${ROLE_COLOR_MAP["manual-qa"].light.bg} ${ROLE_COLOR_MAP["manual-qa"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["manual-qa"].light.badge,
    hex: ROLE_COLOR_MAP["manual-qa"].light.hex,
  },
  automation: {
    displayName: "Automation",
    avatarClassName: `${ROLE_COLOR_MAP["automation"].light.bg} ${ROLE_COLOR_MAP["automation"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["automation"].light.badge,
    hex: ROLE_COLOR_MAP["automation"].light.hex,
  },
  documentation: {
    displayName: "Documentation",
    avatarClassName: `${ROLE_COLOR_MAP["documentation"].light.bg} ${ROLE_COLOR_MAP["documentation"].light.text}`,
    badgeClassName: ROLE_COLOR_MAP["documentation"].light.badge,
    hex: ROLE_COLOR_MAP["documentation"].light.hex,
  },
};

/**
 * Get agent color tokens based on agent ID and model strength.
 *
 * @param agentId - The agent identifier (can be null/undefined)
 * @param model - The agent's model ("opus" for darker, "sonnet" for lighter)
 * @returns AgentColorTokens for styling the agent
 */
export function getAgentColor(
  agentId: string | null | undefined,
  model: AgentModel = null
): AgentColorTokens {
  // Handle null, undefined, or empty agentId
  if (!agentId || agentId.trim() === "") {
    return UNKNOWN_AGENT_COLOR;
  }

  // Get base colors for the agent
  const baseColors = AGENT_COLORS[agentId as AgentId];
  if (!baseColors) {
    return UNKNOWN_AGENT_COLOR;
  }

  // If no model specified, return base colors (sonnet-level intensity)
  if (!model) {
    return baseColors;
  }

  // For opus model, return darker variant
  if (model === "opus") {
    const roleConfig = ROLE_COLOR_MAP[agentId];
    if (roleConfig) {
      return {
        ...baseColors,
        avatarClassName: `${roleConfig.dark.bg} ${roleConfig.dark.text}`,
        badgeClassName: roleConfig.dark.badge,
        hex: roleConfig.dark.hex,
      };
    }
  }

  // For sonnet or unknown model, return base colors
  return baseColors;
}

/**
 * Simplified function that gets color based on agent ID only.
 * Useful for cases where model information is not available.
 */
export function getAgentColorByRole(agentId: string | null | undefined): AgentColorTokens {
  return getAgentColor(agentId, null);
}