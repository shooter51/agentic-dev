/**
 * mcp-server.ts — in-process MCP server for agent tools.
 *
 * Provides the following tools to agents running via the CLI:
 *   signal_complete       — marks task done, sets completionState
 *   send_message          — calls messageBus.sendBlocking
 *   create_memory         — calls memoryManager.create
 *   read_memories         — calls memoryManager.readOwn + readShared
 *   update_task_metadata  — reads task, merges metadata JSON, writes back
 *   beads_create          — stub with in-memory ID
 *   beads_list            — stub returning "No open defects"
 *
 * Returns a server descriptor with a scriptPath that can be used to
 * start a stdio-based MCP server process.
 */

import { eq } from 'drizzle-orm';
import type { MessageBus } from '../messaging';
import type { MemoryManager } from '../memory';
import type { DB } from '../db';
import { tasks as tasksTable } from '../db/schema/tasks';

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface McpServerDeps {
  messageBus: MessageBus;
  memoryManager: MemoryManager;
  db: DB;
  agentId: string;
  taskId: string;
  projectId: string;
  completionState: {
    completed: boolean;
    summary: string;
    handoffContent: string | null;
  };
}

// ---------------------------------------------------------------------------
// MCP server descriptor
// ---------------------------------------------------------------------------

export interface McpServerDescriptor {
  /** Path to a Node.js script that launches the MCP stdio server */
  scriptPath: string;
}

// ---------------------------------------------------------------------------
// In-memory beads stub
// ---------------------------------------------------------------------------

let _beadsCounter = 1;
const _beadsStore: Array<{ id: string; title: string; severity: string; description: string }> = [];

// ---------------------------------------------------------------------------
// Tool implementations — callable directly from within the backend process
// ---------------------------------------------------------------------------

/**
 * signal_complete — marks completion state.
 */
export async function toolSignalComplete(
  deps: McpServerDeps,
  input: { summary: string; handoff_content?: string },
): Promise<string> {
  deps.completionState.completed = true;
  deps.completionState.summary = input.summary;
  deps.completionState.handoffContent = input.handoff_content ?? null;
  return 'Task completion signalled. The pipeline will advance to the next stage.';
}

/**
 * send_message — sends a message via the message bus.
 */
export async function toolSendMessage(
  deps: McpServerDeps,
  input: { to_agent: string; message: string; type: 'clarification' | 'rejection' },
): Promise<string> {
  const response = await deps.messageBus.sendBlocking(
    deps.agentId,
    input.to_agent,
    deps.taskId,
    input.type,
    input.message,
  );
  return response ?? 'Message sent.';
}

/**
 * create_memory — persists a memory record.
 */
export async function toolCreateMemory(
  deps: McpServerDeps,
  input: { type: string; content: string; title?: string },
): Promise<string> {
  const result = await deps.memoryManager.create(deps.agentId, {
    type: input.type as 'project' | 'decision' | 'pattern' | 'teammate' | 'feedback',
    content: input.content,
    title: input.title ?? '',
    projectId: deps.projectId,
  });
  return `Memory created: ${result.memory.id}${result.needsConsolidation ? ' (consolidation recommended)' : ''}`;
}

/**
 * read_memories — reads own and optionally shared memories.
 */
export async function toolReadMemories(
  deps: McpServerDeps,
  input: { type?: string },
): Promise<string> {
  const [own, shared] = await Promise.all([
    deps.memoryManager.readOwn(deps.agentId, deps.projectId),
    deps.memoryManager.readShared(deps.agentId, deps.projectId),
  ]);

  const filter = input.type;
  const filteredOwn = filter ? own.filter((m) => m.type === filter) : own;
  const filteredShared = filter ? shared.filter((m) => m.type === filter) : shared;

  const all = [
    ...filteredOwn.map((m) => `[own] ${m.type}: ${m.title} — ${m.content}`),
    ...filteredShared.map((m) => `[shared] ${m.type}: ${m.title} — ${m.content}`),
  ];

  return all.length > 0 ? all.join('\n\n') : 'No memories found.';
}

/**
 * update_task_metadata — merges key/value into task.metadata JSON.
 */
export async function toolUpdateTaskMetadata(
  deps: McpServerDeps,
  input: { key: string; value: unknown },
): Promise<string> {
  const task = await deps.db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.id, deps.taskId))
    .get();

  if (!task) return 'Task not found.';

  const metadata: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');
  metadata[input.key] = input.value;

  await deps.db
    .update(tasksTable)
    .set({ metadata: JSON.stringify(metadata), updatedAt: new Date().toISOString() })
    .where(eq(tasksTable.id, deps.taskId));

  return `Metadata updated: ${input.key} = ${JSON.stringify(input.value)}`;
}

/**
 * beads_create — stub that stores a defect in memory.
 */
export async function toolBeadsCreate(
  _deps: McpServerDeps,
  input: { title: string; severity: string; description: string },
): Promise<string> {
  const id = `BEADS-${_beadsCounter++}`;
  _beadsStore.push({ id, ...input });
  return `Defect created: ${id}`;
}

/**
 * beads_list — stub returning stored defects.
 */
export async function toolBeadsList(_deps: McpServerDeps): Promise<string> {
  if (_beadsStore.length === 0) return 'No open defects.';
  return _beadsStore.map((b) => `${b.id}: [${b.severity}] ${b.title} — ${b.description}`).join('\n');
}

// ---------------------------------------------------------------------------
// createOrchestratorMcpServer
//
// Returns a descriptor. In this implementation the MCP tools are available
// as in-process functions. The scriptPath is set to a sentinel that
// downstream consumers can use to understand the server is in-process.
//
// When the CLI integration matures this can be replaced with a real
// stdio server process.
// ---------------------------------------------------------------------------

export function createOrchestratorMcpServer(deps: McpServerDeps): McpServerDescriptor | null {
  // Store deps in global registry keyed by agentId+taskId so the MCP
  // script can access them if needed. For now, return null to signal
  // that no external MCP process should be started — tools are handled
  // directly via completionState mutation from the agent process.
  //
  // The MCP server is wired in for future use when the Claude Agent SDK
  // provides first-class stdio MCP support.
  void deps; // suppress unused warning
  return null;
}
