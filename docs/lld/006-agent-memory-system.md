# LLD-006: Agent Memory System

**References:** ADR-0010

## Overview

Each agent has a persistent memory namespace in SQLite. Memories are scored, ranked, and injected into the system prompt within a token budget. Agents CRUD their own memories via tool calls.

## File Structure

```
packages/backend/src/
  memory/
    index.ts               # Exports
    memory-manager.ts      # Core memory operations with access control
    memory-scorer.ts       # Relevance scoring algorithm
    memory-injector.ts     # System prompt injection with token budgeting
    memory-tools.ts        # Tool handlers for agent CRUD
```

Memory tool handlers live in `tools/memory-tools.ts` -- this is where the executor imports them from. They are **not** in the `memory/` directory.

## Memory Manager

```typescript
// memory-manager.ts

interface CreateResult {
  memory: Memory;
  needsConsolidation: boolean;
}

class MemoryManager {
  constructor(private db: DB) {}

  async create(agentId: string, data: CreateMemoryInput): Promise<CreateResult> {
    if (data.content.length > 8000) { // ~2000 tokens
      throw new Error('Memory content exceeds 2,000 token limit');
    }

    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(memories).values({
      id,
      agentId,
      projectId: data.projectId ?? null,
      type: data.type,
      title: data.title,
      content: data.content,
      createdAt: now,
      updatedAt: now,
    });

    // Check memory count — return flag so orchestrator can trigger consolidation
    const needsConsolidation = await this.checkMemoryCount(agentId);

    const memory = this.db.select().from(memories).where(eq(memories.id, id)).get()!;
    return { memory, needsConsolidation };
  }

  async readOwn(agentId: string, projectId?: string): Promise<Memory[]> {
    const conditions = [eq(memories.agentId, agentId)];
    if (projectId) {
      conditions.push(
        or(eq(memories.projectId, projectId), isNull(memories.projectId))!
      );
    }
    return this.db.select().from(memories).where(and(...conditions));
  }

  async readShared(agentId: string, projectId: string): Promise<Memory[]> {
    // Read other agents' project and decision memories for the same project
    return this.db.select().from(memories).where(and(
      ne(memories.agentId, agentId),
      eq(memories.projectId, projectId),
      inArray(memories.type, ['project', 'decision']),
    ));
  }

  async update(agentId: string, memoryId: string, data: UpdateMemoryInput): Promise<void> {
    // Verify ownership
    const memory = await this.db.select().from(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.agentId, agentId)))
      .get();

    if (!memory) {
      throw new Error('Memory not found or access denied');
    }

    await this.db.update(memories).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(memories.id, memoryId));
  }

  async delete(agentId: string, memoryId: string): Promise<void> {
    const memory = await this.db.select().from(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.agentId, agentId)))
      .get();

    if (!memory) {
      throw new Error('Memory not found or access denied');
    }

    await this.db.delete(memories).where(eq(memories.id, memoryId));
  }

  // Operator override — bypasses ownership check
  async forceUpdate(memoryId: string, data: UpdateMemoryInput): Promise<void> {
    await this.db.update(memories).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(memories.id, memoryId));
  }

  // Operator override — bypasses ownership check
  async forceDelete(memoryId: string): Promise<void> {
    await this.db.delete(memories).where(eq(memories.id, memoryId));
  }

  private async checkMemoryCount(agentId: string): Promise<boolean> {
    const count = await this.db.select({ count: sql`count(*)` })
      .from(memories)
      .where(eq(memories.agentId, agentId))
      .get();

    if (count && count.count > 100) {
      // Return true so the caller (create()) can surface it to the orchestrator
      // via the { needsConsolidation: true } flag in CreateResult
      return true;
    }
    return false;
  }
}
```

## Memory Scorer

```typescript
// memory-scorer.ts

interface ScoredMemory {
  memory: Memory;
  score: number;
}

const WEIGHTS = {
  project: 0.4,
  type: 0.35,
  recency: 0.25,
};

const TYPE_PRIORITY: Record<string, number> = {
  feedback: 1.0,
  decision: 0.8,
  project: 0.6,
  pattern: 0.4,
  teammate: 0.2,
};

function scoreMemories(
  memories: Memory[],
  targetProjectId: string | null,
  now: Date = new Date()
): ScoredMemory[] {
  return memories.map(memory => {
    // Project match score
    let projectScore: number;
    if (memory.projectId === targetProjectId) {
      projectScore = 1.0;
    } else if (memory.projectId === null) {
      projectScore = 0.5; // Global memory
    } else {
      projectScore = 0.0; // Different project
    }

    // Type priority score
    const typeScore = TYPE_PRIORITY[memory.type] ?? 0.3;

    // Recency score per ADR-0010:
    //   - Updated within last 24h: score 1.0 (plateau)
    //   - After 24h: linear decay from 1.0 to 0.1 over 90 days
    const ageMs = now.getTime() - new Date(memory.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyScore = ageDays <= 1
      ? 1.0
      : Math.max(0.1, 1.0 - ((ageDays - 1) / 89) * 0.9);

    const score =
      WEIGHTS.project * projectScore +
      WEIGHTS.type * typeScore +
      WEIGHTS.recency * recencyScore;

    return { memory, score };
  }).sort((a, b) => b.score - a.score);
}
```

## Memory Injector

```typescript
// memory-injector.ts

const MAX_MEMORY_TOKENS = 8000;

function buildMemoriesSection(
  ownMemories: Memory[],
  sharedMemories: Memory[],
  projectId: string | null,
): string {
  // Score all memories
  const scoredOwn = scoreMemories(ownMemories, projectId);
  const scoredShared = scoreMemories(sharedMemories, projectId);

  // Interleave by score
  const allScored = [...scoredOwn, ...scoredShared]
    .sort((a, b) => b.score - a.score);

  // Build section within token budget
  const sections: string[] = ['## Your Memories\n'];
  let estimatedTokens = 10;

  for (const { memory, score } of allScored) {
    const entry = formatMemoryEntry(memory);
    const entryTokens = estimateTokens(entry);

    if (estimatedTokens + entryTokens > MAX_MEMORY_TOKENS) break;

    sections.push(entry);
    estimatedTokens += entryTokens;
  }

  return sections.join('\n');
}

function formatMemoryEntry(memory: Memory): string {
  const source = memory.agentId; // Shows "architect" for shared memories
  const scope = memory.projectId ? `[${memory.projectId}]` : '[global]';
  return `### ${memory.title} ${scope}\n**Type:** ${memory.type} | **From:** ${source}\n${memory.content}\n`;
}

function estimateTokens(text: string): number {
  // Rough estimate: 1 token ~= 4 characters for English text
  return Math.ceil(text.length / 4);
}
```

## Memory Tool Handlers

```typescript
// tools/memory-tools.ts (imported by tools/executor.ts)

class CreateMemoryHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(input: {
    title: string;
    content: string;
    type: 'project' | 'pattern' | 'decision' | 'teammate' | 'feedback';
    project_id?: string;
  }, ctx: ToolContext): Promise<string> {
    const { memory, needsConsolidation } = await this.memoryManager.create(ctx.agentId, {
      title: input.title,
      content: input.content,
      type: input.type,
      projectId: input.project_id,
    });
    const msg = `Memory created: ${memory.id} — "${memory.title}"`;
    return needsConsolidation
      ? `${msg}\n\n⚠ You have over 100 memories. Consider consolidating related memories to stay within budget.`
      : msg;
  }
}

class ReadMemoriesHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(input: { project_id?: string }, ctx: ToolContext): Promise<string> {
    const own = await this.memoryManager.readOwn(ctx.agentId, input.project_id);
    const shared = input.project_id
      ? await this.memoryManager.readShared(ctx.agentId, input.project_id)
      : [];

    const all = [...own, ...shared];
    if (all.length === 0) return 'No memories found.';

    return all.map(m =>
      `[${m.id}] (${m.type}) ${m.title}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`
    ).join('\n\n');
  }
}

class UpdateMemoryHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(input: {
    memory_id: string;
    title?: string;
    content?: string;
    type?: 'project' | 'pattern' | 'decision' | 'teammate' | 'feedback';
  }, ctx: ToolContext): Promise<string> {
    const { memory_id, ...data } = input;
    await this.memoryManager.update(ctx.agentId, memory_id, data);
    return `Memory updated: ${memory_id}`;
  }
}

class DeleteMemoryHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(input: { memory_id: string }, ctx: ToolContext): Promise<string> {
    await this.memoryManager.delete(ctx.agentId, input.memory_id);
    return `Memory deleted: ${input.memory_id}`;
  }
}
```

## Design Notes

**Keyword minimum length:** If keyword-based memory search is added, avoid filtering keywords shorter than 2 characters. A `> 2` char filter strips common dev terms like QA, CI, PR, UI, and API. Use a 1-character minimum, or maintain a whitelist of important short terms: `['QA', 'CI', 'PR', 'UI', 'API', 'DB', 'CD', 'IO']`.
