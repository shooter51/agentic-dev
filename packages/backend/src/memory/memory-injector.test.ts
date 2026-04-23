import { describe, it, expect } from 'vitest';
import { buildMemoriesSection, estimateTokens } from './memory-injector.js';
import type { Memory } from '@agentic-dev/shared';

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date().toISOString();
  return {
    id: `mem-${Math.random()}`,
    agentId: 'agent-1',
    projectId: 'project-1',
    type: 'project',
    title: 'Test Memory',
    content: 'Content here',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('estimateTokens', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);     // 4/4 = 1
    expect(estimateTokens('abcde')).toBe(2);    // ceil(5/4) = 2
    expect(estimateTokens('a'.repeat(100))).toBe(25); // 100/4 = 25
  });

  it('rounds up for partial groups', () => {
    expect(estimateTokens('abc')).toBe(1);  // ceil(3/4) = 1
    expect(estimateTokens('abcdefg')).toBe(2); // ceil(7/4) = 2
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('buildMemoriesSection', () => {
  const projectId = 'project-1';

  it('returns header section when no memories provided', () => {
    const result = buildMemoriesSection([], [], projectId);
    expect(result).toContain('## Your Memories');
  });

  it('includes memory title and content', () => {
    const memory = makeMemory({ title: 'My Decision', content: 'We chose X because Y' });
    const result = buildMemoriesSection([memory], [], projectId);
    expect(result).toContain('My Decision');
    expect(result).toContain('We chose X because Y');
  });

  it('includes scope label for project memories', () => {
    const memory = makeMemory({ projectId: 'my-proj', title: 'Proj Memory', content: 'x' });
    const result = buildMemoriesSection([memory], [], 'my-proj');
    expect(result).toContain('[my-proj]');
  });

  it('includes [global] label for null projectId memories', () => {
    const memory = makeMemory({ projectId: null, title: 'Global Memory', content: 'x' });
    const result = buildMemoriesSection([memory], [], projectId);
    expect(result).toContain('[global]');
  });

  it('includes agent ID in memory entry', () => {
    const memory = makeMemory({ agentId: 'agent-xyz', title: 'Agent Memory', content: 'content' });
    const result = buildMemoriesSection([memory], [], projectId);
    expect(result).toContain('agent-xyz');
  });

  it('includes type in memory entry', () => {
    const memory = makeMemory({ type: 'feedback', title: 'Feedback', content: 'content' });
    const result = buildMemoriesSection([memory], [], projectId);
    expect(result).toContain('feedback');
  });

  it('respects the 8000 token budget by excluding oversized memories', () => {
    const bigContent = 'x'.repeat(8000 * 4); // way more than 8000 tokens
    const bigMemory = makeMemory({ title: 'Big Memory', content: bigContent });
    const smallMemory = makeMemory({ id: 'small', title: 'Small', content: 'tiny' });

    // bigMemory would exceed the budget; smallMemory fits
    // Score smallMemory higher by matching project
    const result = buildMemoriesSection([smallMemory], [bigMemory], projectId);
    expect(result).toContain('Small');
    expect(result).not.toContain(bigContent);
  });

  it('merges own and shared memories and sorts by score', () => {
    const ownMemory = makeMemory({
      id: 'own',
      agentId: 'agent-1',
      projectId,
      type: 'feedback', // highest priority type
      title: 'Own Feedback',
      content: 'own content',
    });

    const sharedMemory = makeMemory({
      id: 'shared',
      agentId: 'agent-2',
      projectId,
      type: 'teammate', // lowest priority type
      title: 'Shared Teammate',
      content: 'shared content',
    });

    const result = buildMemoriesSection([ownMemory], [sharedMemory], projectId);
    // Both should be included
    expect(result).toContain('Own Feedback');
    expect(result).toContain('Shared Teammate');
    // Own Feedback (feedback type) should appear before Shared Teammate (teammate type)
    const ownIdx = result.indexOf('Own Feedback');
    const sharedIdx = result.indexOf('Shared Teammate');
    expect(ownIdx).toBeLessThan(sharedIdx);
  });

  it('includes multiple memories when they all fit within budget', () => {
    const memories = Array.from({ length: 5 }, (_, i) =>
      makeMemory({ id: `m${i}`, title: `Memory ${i}`, content: 'short' }),
    );
    const result = buildMemoriesSection(memories, [], projectId);
    for (let i = 0; i < 5; i++) {
      expect(result).toContain(`Memory ${i}`);
    }
  });

  it('stops adding memories when budget is exhausted', () => {
    // Each entry will be roughly title + content tokens
    // Use medium-sized content so we can predictably exceed budget
    const content = 'a'.repeat(1000); // ~250 tokens per memory
    const memories = Array.from({ length: 50 }, (_, i) =>
      makeMemory({ id: `m${i}`, title: `Memory ${i}`, content }),
    );

    const result = buildMemoriesSection(memories, [], projectId);
    // Not all 50 should be included — the budget should stop us
    const count = (result.match(/### Memory \d+/g) ?? []).length;
    expect(count).toBeLessThan(50);
    expect(count).toBeGreaterThan(0);
  });

  it('handles null projectId for scoping', () => {
    const memory = makeMemory({ projectId: null, type: 'project', title: 'Global', content: 'x' });
    const result = buildMemoriesSection([memory], [], null);
    expect(result).toContain('Global');
  });
});
