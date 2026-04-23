/**
 * cli-runner.ts — runs agents via the Claude CLI subprocess.
 *
 * Replaces agent-runner.ts as the active runner. Uses the `claude` binary
 * with --print and --output-format stream-json to stream tool calls and
 * capture the final result.
 *
 * Exports:
 *   AgentResult               — summary, handoffContent, completedViaSignal
 *   runAgentLoop()            — core loop using claude CLI
 *   runAgentWithErrorHandling() — wrapper with error recovery
 */

import { spawn } from 'child_process';
import type { AgentIdentity } from '@agentic-dev/shared';
import type { Task } from '../db/schema/tasks';
import { buildSystemPrompt, buildTaskPrompt, type AgentContext } from './context-builder';
import type { MessageBus } from '../messaging';
import type { MemoryManager } from '../memory';
import type { DB } from '../db';
import type { SSEBroadcaster } from './orchestrator';
import type { CostTracker } from './cost-tracker';
import { createOrchestratorMcpServer } from '../tools/mcp-server';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AgentResult {
  /** Text extracted from the final end_turn response */
  summary: string;
  /** Handoff document content if signal_complete was used */
  handoffContent: string | null;
  /** Whether the agent signalled explicit completion via signal_complete tool */
  completedViaSignal: boolean;
}

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface RunnerDeps {
  costTracker: CostTracker;
  messageBus: MessageBus;
  memoryManager: MemoryManager;
  db: DB;
  sseBroadcaster: SSEBroadcaster;
}

// ---------------------------------------------------------------------------
// Model mapping
// ---------------------------------------------------------------------------

function resolveModel(model: AgentIdentity['model']): string {
  return model === 'opus' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';
}

// ---------------------------------------------------------------------------
// Tool name mapping: agent allowedTools → Claude Code built-in tool names
// ---------------------------------------------------------------------------

const TOOL_MAP: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  list_files: 'Glob',
  search_files: 'Grep',
  run_command: 'Bash',
  web_search: 'WebSearch',
  web_fetch: 'WebFetch',
};

function mapAllowedTools(allowedTools: string[]): string[] {
  const mapped = new Set<string>();
  for (const tool of allowedTools) {
    const builtin = TOOL_MAP[tool];
    if (builtin) {
      mapped.add(builtin);
    } else {
      // Pass through unknown tools as-is
      mapped.add(tool);
    }
  }
  return Array.from(mapped);
}

// ---------------------------------------------------------------------------
// Claude CLI path
// ---------------------------------------------------------------------------

function getClaudeBinaryPath(): string {
  return process.env['CLAUDE_BIN'] ?? '/Users/tomgibson/.local/bin/claude';
}

// ---------------------------------------------------------------------------
// Stream JSON event types from claude --output-format stream-json
// ---------------------------------------------------------------------------

interface StreamAssistantText {
  type: 'assistant';
  message: { content: Array<{ type: string; text?: string }> };
}

interface StreamResult {
  type: 'result';
  result: string;
  cost_usd?: number;
  is_error?: boolean;
}

interface StreamToolUse {
  type: 'tool_use' | 'tool_result';
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
}

type StreamEvent = StreamAssistantText | StreamResult | StreamToolUse | { type: string };

// ---------------------------------------------------------------------------
// runAgentLoop
// ---------------------------------------------------------------------------

/**
 * Core agent run loop. Spawns the claude CLI with --print and streams
 * output to capture tool calls (for SSE) and the final result.
 *
 * The MCP server is provided in-process via stdio so the agent can:
 *   - signal_complete
 *   - send_message
 *   - create_memory / read_memories
 *   - update_task_metadata
 *   - beads_create / beads_list
 */
export async function runAgentLoop(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  deps: RunnerDeps,
): Promise<AgentResult> {
  // Completion state shared between MCP server and runner
  const completionState = {
    completed: false,
    summary: '',
    handoffContent: null as string | null,
  };

  // Build prompts
  const systemPrompt = buildSystemPrompt(agent, context);
  const taskPrompt = buildTaskPrompt(task, context.handoff, context.claudeMd);

  // Get repoPath from context (may be undefined)
  const repoPath = context.repoPath ?? process.cwd();

  // Create in-process MCP server
  const mcpServer = createOrchestratorMcpServer({
    messageBus: deps.messageBus,
    memoryManager: deps.memoryManager,
    db: deps.db,
    agentId: agent.id,
    taskId: task.id,
    projectId: task.projectId,
    completionState,
  });

  // Map allowed tools
  const builtinTools = mapAllowedTools(agent.allowedTools ?? []);

  // Resolve model
  const modelId = resolveModel(agent.model);

  // Build claude CLI args
  const claudeBin = getClaudeBinaryPath();
  const args: string[] = [
    '--verbose',
    '--output-format', 'stream-json',
    '--model', modelId,
    '--max-turns', '50',
    '--permission-mode', 'bypassPermissions',
    '--system-prompt', systemPrompt,
  ];

  // Add allowed tools
  if (builtinTools.length > 0) {
    args.push('--allowedTools', builtinTools.join(','));
  }

  // Add MCP server via stdio transport
  if (mcpServer) {
    args.push('--mcp-config', JSON.stringify({
      mcpServers: {
        orchestrator: {
          transport: 'stdio',
          command: 'node',
          args: [mcpServer.scriptPath],
        },
      },
    }));
  }

  // The task prompt is passed via -p flag (required for --print mode)
  args.push('-p', taskPrompt);

  return new Promise<AgentResult>((resolve, reject) => {
    const child = spawn(claudeBin, args, {
      cwd: repoPath,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let finalSummary = '';
    let totalCostUsd = 0;

    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event: StreamEvent;
        try {
          event = JSON.parse(trimmed) as StreamEvent;
        } catch {
          // Not JSON — skip
          continue;
        }

        // Capture text from assistant turns
        if (event.type === 'assistant') {
          const assistantEvent = event as StreamAssistantText;
          for (const block of assistantEvent.message.content) {
            if (block.type === 'text' && block.text) {
              finalSummary = block.text;
            }
          }
        }

        // Emit tool_use events as SSE for dashboard
        if (event.type === 'tool_use') {
          const toolEvent = event as StreamToolUse;
          deps.sseBroadcaster.emit('agent-tool-use', {
            agentId: agent.id,
            taskId: task.id,
            tool: toolEvent.name ?? 'unknown',
            input: toolEvent.input ?? {},
            timestamp: new Date().toISOString(),
          });
        }

        // Capture cost from result event
        if (event.type === 'result') {
          const resultEvent = event as StreamResult;
          if (resultEvent.cost_usd) {
            totalCostUsd = resultEvent.cost_usd;
          }
          if (resultEvent.result) {
            finalSummary = resultEvent.result;
          }
          if (resultEvent.is_error) {
            console.warn(`[cli-runner] Agent ${agent.id} result was an error: ${resultEvent.result}`);
          }
        }
      }
    });

    child.on('close', (code) => {
      // Track cost if we got one
      if (totalCostUsd > 0) {
        deps.costTracker.trackCall({
          agentId: agent.id,
          taskId: task.id,
          model: modelId,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 0,
          status: 'success',
        }).catch((err) => {
          console.warn('[cli-runner] Failed to track cost:', err);
        });
      }

      if (code !== 0 && !completionState.completed) {
        console.warn(`[cli-runner] Agent ${agent.id} claude CLI exited with code ${code}. stderr: ${stderr.slice(0, 500)}`);
        // Don't throw — treat as completed with whatever we have
      }

      resolve({
        summary: completionState.summary || finalSummary,
        handoffContent: completionState.handoffContent,
        completedViaSignal: completionState.completed,
      });
    });

    child.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// runAgentWithErrorHandling
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps runAgentLoop with basic error handling and retry for transient failures.
 */
export async function runAgentWithErrorHandling(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  deps: RunnerDeps,
): Promise<AgentResult> {
  let retries = 0;

  while (true) {
    try {
      return await runAgentLoop(agent, task, context, deps);
    } catch (error) {
      retries++;
      if (retries > 3) {
        deps.sseBroadcaster.emit('agent-error', {
          agentId: agent.id,
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      console.warn(`[cli-runner] Agent ${agent.id} attempt ${retries} failed, retrying:`, error);
      await sleep(2000 * retries);
    }
  }
}
