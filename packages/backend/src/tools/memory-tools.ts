import type { ToolHandler, ToolContext, MemoryType } from '@agentic-dev/shared';
import type { MemoryManager } from '../memory';

export class CreateMemoryHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(
    input: {
      title: string;
      content: string;
      type: MemoryType;
      project_id?: string;
    },
    ctx: ToolContext,
  ): Promise<string> {
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

export class ReadMemoriesHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(
    input: { project_id?: string },
    ctx: ToolContext,
  ): Promise<string> {
    const own = await this.memoryManager.readOwn(ctx.agentId, input.project_id);
    const shared = input.project_id
      ? await this.memoryManager.readShared(ctx.agentId, input.project_id)
      : [];

    const all = [...own, ...shared];
    if (all.length === 0) return 'No memories found.';

    return all
      .map(
        (m) =>
          `[${m.id}] (${m.type}) ${m.title}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`,
      )
      .join('\n\n');
  }
}

export class UpdateMemoryHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(
    input: {
      memory_id: string;
      title?: string;
      content?: string;
      type?: MemoryType;
    },
    ctx: ToolContext,
  ): Promise<string> {
    const { memory_id, ...data } = input;
    await this.memoryManager.update(ctx.agentId, memory_id, data);
    return `Memory updated: ${memory_id}`;
  }
}

export class DeleteMemoryHandler implements ToolHandler {
  constructor(private memoryManager: MemoryManager) {}

  async execute(
    input: { memory_id: string },
    ctx: ToolContext,
  ): Promise<string> {
    await this.memoryManager.delete(ctx.agentId, input.memory_id);
    return `Memory deleted: ${input.memory_id}`;
  }
}
