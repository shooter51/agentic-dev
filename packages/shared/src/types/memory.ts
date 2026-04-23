export type MemoryType = 'project' | 'pattern' | 'decision' | 'teammate' | 'feedback';

export interface Memory {
  id: string;
  agentId: string;
  projectId: string | null;
  type: MemoryType;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a new memory via the memory manager */
export interface CreateMemoryInput {
  title: string;
  content: string;
  type: MemoryType;
  projectId?: string | null;
}

/** Partial update for an existing memory — all fields optional */
export interface UpdateMemoryInput {
  title?: string;
  content?: string;
  type?: MemoryType;
}

/**
 * A memory paired with its relevance score, produced by the memory scorer.
 * Higher score = higher priority for injection into the agent system prompt.
 */
export interface ScoredMemory {
  memory: Memory;
  score: number;
}
