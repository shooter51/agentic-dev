import type { ToolHandler, ToolContext } from '@agentic-dev/shared';
import type { Sandbox } from './sandbox';

/**
 * Beads is the project/task tracking tool used by agents.
 * These handlers manage the creation, updating, and listing of Beads items
 * (issues, tasks, tickets) in the project management system.
 *
 * NOTE: Beads integration is currently stub-backed.  When the Beads API client
 * is available, replace the stub implementations with real API calls.
 */

// ---------------------------------------------------------------------------
// Shared stub store (in-memory; replaced by real Beads API when available)
// ---------------------------------------------------------------------------

interface BeadsItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  assignee?: string;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
}

// Simple in-memory stub store — persists for the lifetime of the process.
const BEADS_STORE = new Map<string, BeadsItem>();
let beadsSequence = 1;

function generateBeadsId(): string {
  return `BEADS-${beadsSequence++}`;
}

// ---------------------------------------------------------------------------
// BeadsCreateHandler
// ---------------------------------------------------------------------------

export class BeadsCreateHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const title = input['title'] as string;
    const description = (input['description'] as string | undefined) ?? '';
    const type = (input['type'] as string | undefined) ?? 'task';
    const priority = (input['priority'] as string | undefined) ?? 'P2';
    const assignee = input['assignee'] as string | undefined;
    const labels = input['labels'] as string[] | undefined;

    if (!title) {
      throw new Error('Beads item title is required');
    }

    const id = generateBeadsId();
    const now = new Date().toISOString();

    const item: BeadsItem = {
      id,
      projectId: ctx.taskId, // associate with current task's project context
      title,
      description,
      status: 'open',
      priority,
      type,
      assignee,
      labels,
      createdAt: now,
      updatedAt: now,
    };

    BEADS_STORE.set(id, item);

    return JSON.stringify({ id, title, status: item.status, url: `beads://${id}` }, null, 2);
  }
}

// ---------------------------------------------------------------------------
// BeadsUpdateHandler
// ---------------------------------------------------------------------------

export class BeadsUpdateHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
    const id = input['id'] as string;

    if (!id) {
      throw new Error('Beads item id is required');
    }

    const item = BEADS_STORE.get(id);
    if (!item) {
      throw new Error(`Beads item not found: ${id}`);
    }

    if (input['title'] !== undefined) item.title = input['title'] as string;
    if (input['description'] !== undefined) item.description = input['description'] as string;
    if (input['status'] !== undefined) item.status = input['status'] as string;
    if (input['priority'] !== undefined) item.priority = input['priority'] as string;
    if (input['assignee'] !== undefined) item.assignee = input['assignee'] as string;
    if (input['labels'] !== undefined) item.labels = input['labels'] as string[];

    item.updatedAt = new Date().toISOString();
    BEADS_STORE.set(id, item);

    return JSON.stringify({ id, status: item.status, updatedAt: item.updatedAt }, null, 2);
  }
}

// ---------------------------------------------------------------------------
// BeadsListHandler
// ---------------------------------------------------------------------------

export class BeadsListHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
    const statusFilter = input['status'] as string | undefined;
    const typeFilter = input['type'] as string | undefined;

    let items = Array.from(BEADS_STORE.values());

    if (statusFilter) {
      items = items.filter(i => i.status === statusFilter);
    }
    if (typeFilter) {
      items = items.filter(i => i.type === typeFilter);
    }

    if (items.length === 0) {
      return 'No Beads items found.';
    }

    return items
      .map(i => `[${i.id}] (${i.type}/${i.priority}) ${i.title} — ${i.status}`)
      .join('\n');
  }
}
