/**
 * context-builder.ts — assembles the system prompt for an agent run.
 *
 * Token budget (~23K total):
 *   identity:             3,000  (agent role, practices)
 *   tools:                2,000  (tool descriptions — handled by Anthropic SDK)
 *   claudeMd:             2,000  (project CLAUDE.md)
 *   handoff:              4,000  (handoff doc from previous stage)
 *   memories:             8,000  (scored and ranked memories)
 *   conversationSummary:  4,000  (summary if resuming interrupted work)
 */

import type { AgentIdentity, Memory } from '@agentic-dev/shared';
import { buildMemoriesSection, estimateTokens } from '../memory';

// ---------------------------------------------------------------------------
// Budget constants (in tokens)
// ---------------------------------------------------------------------------

export interface ContextBudget {
  identity: number;
  tools: number;
  claudeMd: number;
  handoff: number;
  memories: number;
  conversationSummary: number;
}

const BUDGET: ContextBudget = {
  identity: 3_000,
  tools: 2_000,
  claudeMd: 2_000,
  handoff: 4_000,
  memories: 8_000,
  conversationSummary: 4_000,
};

// ---------------------------------------------------------------------------
// AgentContext — runtime context passed into buildSystemPrompt
// ---------------------------------------------------------------------------

export interface AgentContext {
  /** Project CLAUDE.md contents (project-level instructions) */
  claudeMd: string | null;
  /** Memories scoped to this agent */
  ownMemories: Memory[];
  /** Shared project/decision memories from peer agents */
  sharedMemories: Memory[];
  /** Project ID for memory scoping */
  projectId: string | null;
  /** Repository path on disk */
  repoPath?: string | null;
  /** Handoff document from the previous stage agent */
  handoff: string | null;
  /** Conversation summary if resuming after an interrupt */
  conversationSummary: string | null;
  /** Optional corrective message injected after an invalid output error */
  correctiveMessage?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate text to approximately `maxTokens` tokens using a 4 chars/token
 * approximation. Appends an indicator if truncated.
 */
function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[... truncated to fit context budget ...]';
}

/**
 * Build the identity section from agent metadata.
 * Includes role, model tier, practices guidelines, and allowed tools.
 */
function buildIdentitySection(agent: AgentIdentity): string {
  const lines: string[] = [
    `## Your Identity`,
    ``,
    `**Role:** ${agent.role}`,
    `**Agent ID:** ${agent.id}`,
    `**Model:** ${agent.model === 'opus' ? 'Claude Opus (senior)' : 'Claude Sonnet'}`,
    `**Pipeline lanes:** ${agent.lane.join(', ')}`,
    ``,
    `## Your Practices & Guidelines`,
    ``,
    agent.practices,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

/**
 * Assemble the full system prompt for an agent run, respecting token budgets
 * for each section. Sections are joined with horizontal rules for clarity.
 */
export function buildSystemPrompt(
  agent: AgentIdentity,
  context: AgentContext,
): string {
  const sections: string[] = [];

  // 1. Agent identity (~3K tokens, always included)
  const identitySection = buildIdentitySection(agent);
  sections.push(truncateToTokens(identitySection, BUDGET.identity));

  // 2. Project CLAUDE.md (project-level instructions, truncated to 2K)
  if (context.claudeMd) {
    const claudeMdHeader = `## Project Instructions (CLAUDE.md)\n\n`;
    sections.push(claudeMdHeader + truncateToTokens(context.claudeMd, BUDGET.claudeMd));
  }

  // 3. Relevant memories (scored and ranked by memory-injector, budget 8K)
  const memoriesSection = buildMemoriesSection(
    context.ownMemories,
    context.sharedMemories,
    context.projectId,
  );
  sections.push(memoriesSection);

  // 4. Handoff document from previous stage agent (truncated to 4K)
  if (context.handoff) {
    const handoffHeader = `## Handoff from Previous Stage\n\n`;
    sections.push(handoffHeader + truncateToTokens(context.handoff, BUDGET.handoff));
  }

  // 5. Conversation summary if resuming after an interrupt (truncated to 4K)
  if (context.conversationSummary) {
    const summaryHeader = `## Conversation Summary (Resumed Work)\n\n`;
    sections.push(
      summaryHeader + truncateToTokens(context.conversationSummary, BUDGET.conversationSummary),
    );
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Build the initial user message for a task — contains the task description
 * and any available context.
 */
export function buildTaskPrompt(
  task: { id: string; title: string; description: string | null; stage: string; priority: string; type: string },
  handoff: string | null,
  claudeMd: string | null,
): string {
  const lines: string[] = [
    `# Task: ${task.title}`,
    ``,
    `**Task ID:** ${task.id}`,
    `**Stage:** ${task.stage}`,
    `**Priority:** ${task.priority}`,
    `**Type:** ${task.type}`,
  ];

  if (task.description) {
    lines.push(``, `## Description`, ``, task.description);
  }

  if (claudeMd) {
    lines.push(
      ``,
      `## Project Instructions`,
      ``,
      truncateToTokens(claudeMd, BUDGET.claudeMd),
    );
  }

  if (handoff) {
    lines.push(
      ``,
      `## Handoff from Previous Agent`,
      ``,
      truncateToTokens(handoff, BUDGET.handoff),
    );
  }

  lines.push(
    ``,
    `## Available MCP Tools`,
    ``,
    `The following MCP tools are available via the orchestrator MCP server:`,
    ``,
    `- **signal_complete(summary, handoff_content?)** — call when your work is done. Required to advance the pipeline.`,
    `- **create_memory(type, content, title?)** — persist knowledge for future use (types: project, decision, snippet, personal).`,
    `- **read_memories(type?)** — retrieve your own memories and shared project/decision memories.`,
    `- **send_message(to_agent, message, type)** — send a clarification or rejection to another agent.`,
    `- **update_task_metadata(key, value)** — write structured metadata for pipeline quality gates.`,
    `- **beads_create(title, severity, description)** — log a defect.`,
    `- **beads_list()** — list open defects.`,
    ``,
    `> **WARNING**: Do NOT run tests or servers against localhost:3001. That port is reserved for the backend API.`,
    ``,
    `## Quality Gate Requirements`,
    ``,
    `Before calling signal_complete, ensure:`,
    `- Unit test coverage ≥ 80% for all new/modified code`,
    `- All tests pass`,
    `- No hardcoded secrets or credentials`,
    `- update_task_metadata has been called with relevant gate values (allTestsPassing, unitCoverage, etc.)`,
    ``,
    `---`,
    ``,
    `Please complete your work for this task. When done, use the \`signal_complete\` tool`,
    `with a summary of your work and a handoff document for the next agent.`,
  );

  return lines.join('\n');
}

/**
 * Build the interrupt system prompt — used when a human message arrives while
 * the agent is working. Provides minimal context so the agent can respond
 * quickly and resume.
 */
export function buildInterruptSystemPrompt(agentState: {
  id: string;
  model: string;
  currentTaskId: string | null;
  systemPrompt: string;
}): string {
  return [
    agentState.systemPrompt,
    `---`,
    `## Interrupt Mode`,
    ``,
    `You have received an urgent message while working on task ${agentState.currentTaskId ?? 'unknown'}.`,
    `Please respond to this message concisely and clearly.`,
    `Your original task work has been saved and will resume after you respond.`,
  ].join('\n\n');
}

// Re-export estimateTokens for use in agent-runner
export { estimateTokens };
