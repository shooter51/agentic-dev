import type { Memory, ScoredMemory } from '@agentic-dev/shared';

const WEIGHTS = {
  project: 0.4,
  type: 0.35,
  recency: 0.25,
} as const;

const TYPE_PRIORITY: Record<string, number> = {
  feedback: 1.0,
  decision: 0.8,
  project: 0.6,
  pattern: 0.4,
  teammate: 0.2,
};

/**
 * Score and rank memories by relevance to the given project.
 *
 * Scoring formula (weights sum to 1.0):
 *   - project match (0.4): 1.0 = same project, 0.5 = global, 0.0 = different project
 *   - type priority (0.35): per TYPE_PRIORITY map
 *   - recency (0.25): 1.0 for memories updated within 24h (plateau),
 *     then linear decay from 1.0 to 0.1 over the following 89 days
 */
export function scoreMemories(
  memories: Memory[],
  targetProjectId: string | null,
  now: Date = new Date(),
): ScoredMemory[] {
  return memories
    .map((memory) => {
      // Project match score
      let projectScore: number;
      if (memory.projectId === targetProjectId) {
        projectScore = 1.0;
      } else if (memory.projectId === null) {
        projectScore = 0.5;
      } else {
        projectScore = 0.0;
      }

      // Type priority score
      const typeScore = TYPE_PRIORITY[memory.type] ?? 0.3;

      // Recency score per ADR-0010:
      //   - Updated within last 24h: score 1.0 (plateau)
      //   - After 24h: linear decay from 1.0 to 0.1 over 89 days (days 1–90)
      const ageMs = now.getTime() - new Date(memory.updatedAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const recencyScore =
        ageDays <= 1
          ? 1.0
          : Math.max(0.1, 1.0 - ((ageDays - 1) / 89) * 0.9);

      const score =
        WEIGHTS.project * projectScore +
        WEIGHTS.type * typeScore +
        WEIGHTS.recency * recencyScore;

      return { memory, score };
    })
    .sort((a, b) => b.score - a.score);
}
