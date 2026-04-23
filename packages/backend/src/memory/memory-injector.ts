import type { Memory } from '@agentic-dev/shared';
import { scoreMemories } from './memory-scorer';

const MAX_MEMORY_TOKENS = 8000;

/**
 * Rough token estimator: ~1 token per 4 characters of English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatMemoryEntry(memory: Memory): string {
  const scope = memory.projectId ? `[${memory.projectId}]` : '[global]';
  return `### ${memory.title} ${scope}\n**Type:** ${memory.type} | **From:** ${memory.agentId}\n${memory.content}\n`;
}

/**
 * Build the "## Your Memories" section to inject into an agent's system prompt.
 *
 * Combines own and shared memories, scores and ranks them, then greedily
 * fills up to MAX_MEMORY_TOKENS (8 000 tokens) in descending score order.
 */
export function buildMemoriesSection(
  ownMemories: Memory[],
  sharedMemories: Memory[],
  projectId: string | null,
): string {
  const scoredOwn = scoreMemories(ownMemories, projectId);
  const scoredShared = scoreMemories(sharedMemories, projectId);

  const allScored = [...scoredOwn, ...scoredShared].sort((a, b) => b.score - a.score);

  const sections: string[] = ['## Your Memories\n'];
  let estimatedTokens = 10; // budget for the header

  for (const { memory } of allScored) {
    const entry = formatMemoryEntry(memory);
    const entryTokens = estimateTokens(entry);

    if (estimatedTokens + entryTokens > MAX_MEMORY_TOKENS) break;

    sections.push(entry);
    estimatedTokens += entryTokens;
  }

  return sections.join('\n');
}
