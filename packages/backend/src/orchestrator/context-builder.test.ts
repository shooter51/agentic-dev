import { describe, it, expect, vi } from 'vitest';
import { buildSystemPrompt, buildTaskPrompt, buildInterruptSystemPrompt, estimateTokens } from './context-builder.js';
import type { AgentIdentity } from '@agentic-dev/shared';
import type { AgentContext } from './context-builder.js';

function makeAgent(overrides: Partial<AgentIdentity> = {}): AgentIdentity {
  return {
    id: 'agent-1',
    role: 'Developer',
    model: 'sonnet',
    lane: ['development'],
    practices: 'Write clean code. Test everything.',
    allowedTools: ['read_file', 'write_file'],
    systemPrompt: '',
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    claudeMd: null,
    ownMemories: [],
    sharedMemories: [],
    projectId: null,
    handoff: null,
    conversationSummary: null,
    correctiveMessage: null,
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('includes agent identity section', () => {
    const agent = makeAgent({ role: 'Tech Lead', id: 'tl-001' });
    const result = buildSystemPrompt(agent, makeContext());
    expect(result).toContain('Tech Lead');
    expect(result).toContain('tl-001');
  });

  it('labels opus model as Claude Opus (senior)', () => {
    const agent = makeAgent({ model: 'opus' });
    const result = buildSystemPrompt(agent, makeContext());
    expect(result).toContain('Claude Opus (senior)');
  });

  it('labels sonnet model as Claude Sonnet', () => {
    const agent = makeAgent({ model: 'sonnet' });
    const result = buildSystemPrompt(agent, makeContext());
    expect(result).toContain('Claude Sonnet');
  });

  it('includes pipeline lanes', () => {
    const agent = makeAgent({ lane: ['development', 'tech_lead_review'] });
    const result = buildSystemPrompt(agent, makeContext());
    expect(result).toContain('development');
    expect(result).toContain('tech_lead_review');
  });

  it('includes practices text', () => {
    const agent = makeAgent({ practices: 'Always write tests first.' });
    const result = buildSystemPrompt(agent, makeContext());
    expect(result).toContain('Always write tests first.');
  });

  it('includes CLAUDE.md section when present', () => {
    const context = makeContext({ claudeMd: '# Project Rules\n\nUse TypeScript strictly.' });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).toContain('Project Instructions (CLAUDE.md)');
    expect(result).toContain('Use TypeScript strictly.');
  });

  it('omits CLAUDE.md section when null', () => {
    const context = makeContext({ claudeMd: null });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).not.toContain('Project Instructions (CLAUDE.md)');
  });

  it('includes memories section', () => {
    const result = buildSystemPrompt(makeAgent(), makeContext());
    expect(result).toContain('## Your Memories');
  });

  it('includes handoff section when present', () => {
    const context = makeContext({ handoff: 'Previous agent completed the database schema.' });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).toContain('Handoff from Previous Stage');
    expect(result).toContain('Previous agent completed the database schema.');
  });

  it('omits handoff section when null', () => {
    const context = makeContext({ handoff: null });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).not.toContain('Handoff from Previous Stage');
  });

  it('includes conversation summary when present', () => {
    const context = makeContext({ conversationSummary: 'Implemented auth module, next: testing.' });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).toContain('Conversation Summary (Resumed Work)');
    expect(result).toContain('Implemented auth module');
  });

  it('omits conversation summary when null', () => {
    const result = buildSystemPrompt(makeAgent(), makeContext());
    expect(result).not.toContain('Conversation Summary');
  });

  it('truncates oversized CLAUDE.md to 2000 token budget (8000 chars)', () => {
    const hugeMd = 'x'.repeat(20_000); // 5000 tokens — exceeds 2000
    const context = makeContext({ claudeMd: hugeMd });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).toContain('[... truncated to fit context budget ...]');
  });

  it('truncates oversized handoff to 4000 token budget (16000 chars)', () => {
    const hugeHandoff = 'y'.repeat(30_000);
    const context = makeContext({ handoff: hugeHandoff });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).toContain('[... truncated to fit context budget ...]');
  });

  it('joins sections with horizontal rule separator', () => {
    const context = makeContext({ claudeMd: '# Rules', handoff: 'Handoff doc' });
    const result = buildSystemPrompt(makeAgent(), context);
    expect(result).toContain('\n\n---\n\n');
  });
});

describe('buildTaskPrompt', () => {
  const task = {
    id: 'task-abc',
    title: 'Build Authentication',
    description: 'Implement JWT-based auth with refresh tokens',
    stage: 'development',
    priority: 'P1',
    type: 'feature',
  };

  it('includes task title and id', () => {
    const result = buildTaskPrompt(task, null, null);
    expect(result).toContain('Build Authentication');
    expect(result).toContain('task-abc');
  });

  it('includes stage, priority, type', () => {
    const result = buildTaskPrompt(task, null, null);
    expect(result).toContain('development');
    expect(result).toContain('P1');
    expect(result).toContain('feature');
  });

  it('includes description when present', () => {
    const result = buildTaskPrompt(task, null, null);
    expect(result).toContain('Implement JWT-based auth');
  });

  it('omits description section when null', () => {
    const noDesc = { ...task, description: null };
    const result = buildTaskPrompt(noDesc, null, null);
    expect(result).not.toContain('## Description');
  });

  it('includes CLAUDE.md project instructions when provided', () => {
    const result = buildTaskPrompt(task, null, '# My Rules\n\nUse ESM.');
    expect(result).toContain('Project Instructions');
    expect(result).toContain('Use ESM.');
  });

  it('includes handoff when provided', () => {
    const result = buildTaskPrompt(task, 'Schema is ready.', null);
    expect(result).toContain('Handoff from Previous Agent');
    expect(result).toContain('Schema is ready.');
  });

  it('always includes completion instruction', () => {
    const result = buildTaskPrompt(task, null, null);
    expect(result).toContain('Completion Instructions');
  });

  it('truncates oversized claudeMd', () => {
    const hugeMd = 'z'.repeat(20_000);
    const result = buildTaskPrompt(task, null, hugeMd);
    expect(result).toContain('[... truncated to fit context budget ...]');
  });

  it('truncates oversized handoff', () => {
    const hugeHandoff = 'w'.repeat(30_000);
    const result = buildTaskPrompt(task, hugeHandoff, null);
    expect(result).toContain('[... truncated to fit context budget ...]');
  });
});

describe('buildInterruptSystemPrompt', () => {
  it('includes original system prompt', () => {
    const agentState = {
      id: 'agent-1',
      model: 'sonnet',
      currentTaskId: 'task-99',
      systemPrompt: 'You are a senior developer.',
    };
    const result = buildInterruptSystemPrompt(agentState);
    expect(result).toContain('You are a senior developer.');
  });

  it('mentions interrupt mode', () => {
    const agentState = {
      id: 'agent-1',
      model: 'sonnet',
      currentTaskId: 'task-99',
      systemPrompt: 'Sys prompt',
    };
    const result = buildInterruptSystemPrompt(agentState);
    expect(result).toContain('Interrupt Mode');
  });

  it('mentions the current task id', () => {
    const agentState = {
      id: 'agent-1',
      model: 'sonnet',
      currentTaskId: 'task-XYZ',
      systemPrompt: 'Sys',
    };
    const result = buildInterruptSystemPrompt(agentState);
    expect(result).toContain('task-XYZ');
  });

  it('handles null currentTaskId gracefully', () => {
    const agentState = {
      id: 'agent-1',
      model: 'sonnet',
      currentTaskId: null,
      systemPrompt: 'Sys',
    };
    const result = buildInterruptSystemPrompt(agentState);
    expect(result).toContain('unknown');
  });
});

describe('estimateTokens (re-exported)', () => {
  it('estimates 1 token per 4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});
