/**
 * cli-runner.ts — runs agents via CLI subprocesses (Claude Code or OpenCode).
 *
 * Supports two backends controlled by AGENT_RUNNER env var:
 *   - "claude"   (default) — uses `claude` CLI with --output-format stream-json
 *   - "opencode" — uses `opencode run` with --format json
 *
 * Exports:
 *   AgentResult               — summary, handoffContent, completedViaSignal
 *   RunnerDeps                — shared dependencies
 *   runAgentLoop()            — core loop using selected CLI
 *   runAgentWithErrorHandling() — wrapper with error recovery
 */

import { spawn } from 'child_process';
import { realpathSync, existsSync } from 'fs';
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
  /** Called with a kill function when the child process spawns */
  onProcessSpawned?: (kill: () => void) => void;
}

// ---------------------------------------------------------------------------
// Runner backend selection
// ---------------------------------------------------------------------------

type RunnerBackend = 'claude' | 'opencode';

function getRunnerBackend(): RunnerBackend {
  const val = (process.env['AGENT_RUNNER'] ?? 'claude').toLowerCase();
  if (val === 'opencode') return 'opencode';
  return 'claude';
}

// ---------------------------------------------------------------------------
// Model mapping
// ---------------------------------------------------------------------------

function resolveClaudeModel(model: AgentIdentity['model']): string {
  return model === 'opus' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514';
}

function resolveOpenCodeModel(model: AgentIdentity['model']): string {
  // OpenCode uses provider/model format. Check env for overrides.
  if (model === 'opus') {
    return process.env['OPENCODE_OPUS_MODEL'] ?? 'anthropic/claude-opus-4-20250514';
  }
  return process.env['OPENCODE_SONNET_MODEL'] ?? 'anthropic/claude-sonnet-4-20250514';
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
      mapped.add(tool);
    }
  }
  return Array.from(mapped);
}

// ---------------------------------------------------------------------------
// Binary paths
// ---------------------------------------------------------------------------

function getClaudeBinaryPath(): string {
  const bin = process.env['CLAUDE_BIN'] ?? 'claude';
  try {
    return realpathSync(bin);
  } catch {
    return bin;
  }
}

function getOpenCodeBinaryPath(): string {
  const bin = process.env['OPENCODE_BIN'] ?? 'opencode';
  try {
    return realpathSync(bin);
  } catch {
    return bin;
  }
}

// ---------------------------------------------------------------------------
// Stream JSON event types (Claude)
// ---------------------------------------------------------------------------

interface StreamAssistantText {
  type: 'assistant';
  message: { content: Array<{ type: string; text?: string; name?: string }> };
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
// OpenCode JSON event types
// ---------------------------------------------------------------------------

interface OpenCodeEvent {
  type: string;
  timestamp?: number;
  sessionID?: string;
  // text events
  text?: { content: string; role?: string };
  // tool events
  tool?: { name: string; args?: Record<string, unknown>; result?: string };
  // error events
  error?: { name: string; data?: { message: string } };
  // completion events
  result?: { content: string; cost_usd?: number };
}

// ---------------------------------------------------------------------------
// Resolve working directory
// ---------------------------------------------------------------------------

function resolveWorkDir(context: AgentContext): string {
  const candidatePath = context.repoPath ?? process.cwd();
  // Fall back to /tmp if project path doesn't exist — NEVER use process.cwd()
  // because that's the main agentic-dev repo and agents editing there crash the frontend
  return existsSync(candidatePath) ? candidatePath : '/tmp';
}

// ---------------------------------------------------------------------------
// Build CLI args
// ---------------------------------------------------------------------------

function buildClaudeArgs(
  agent: AgentIdentity,
  systemPrompt: string,
  taskPrompt: string,
  mcpServer: { scriptPath: string } | null,
): string[] {
  const modelId = resolveClaudeModel(agent.model);
  const builtinTools = mapAllowedTools(agent.allowedTools ?? []);

  const args: string[] = [
    '--verbose',
    '--output-format', 'stream-json',
    '--model', modelId,
    '--max-turns', '50',
    '--permission-mode', 'bypassPermissions',
    '--system-prompt', systemPrompt,
  ];

  if (builtinTools.length > 0) {
    args.push('--allowedTools', builtinTools.join(','));
  }

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

  args.push('-p', taskPrompt);
  return args;
}

function buildOpenCodeArgs(
  agent: AgentIdentity,
  systemPrompt: string,
  taskPrompt: string,
): string[] {
  const modelId = resolveOpenCodeModel(agent.model);

  // OpenCode uses `run` subcommand with the prompt as positional args.
  // System prompt is prepended to the task prompt since opencode doesn't have
  // a separate --system-prompt flag.
  const fullPrompt = `${systemPrompt}\n\n---\n\n${taskPrompt}`;

  return [
    'run',
    '--format', 'json',
    '-m', modelId,
    fullPrompt,
  ];
}

// ---------------------------------------------------------------------------
// Event parsers
// ---------------------------------------------------------------------------

function parseClaudeEvent(
  line: string,
  agent: AgentIdentity,
  task: Task,
  deps: RunnerDeps,
  state: { finalSummary: string; totalCostUsd: number; completionState: CompletionState },
): void {
  let event: StreamEvent;
  try {
    event = JSON.parse(line) as StreamEvent;
  } catch {
    return;
  }

  if (event.type === 'assistant') {
    const assistantEvent = event as StreamAssistantText;
    for (const block of assistantEvent.message?.content ?? []) {
      if (block.type === 'text' && block.text) {
        state.finalSummary = block.text;
      }
      if (block.type === 'tool_use') {
        deps.sseBroadcaster.emit('agent-tool-use', {
          agentId: agent.id,
          taskId: task.id,
          tool: block.name ?? 'unknown',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  if (event.type === 'result') {
    const resultEvent = event as StreamResult;
    if (resultEvent.cost_usd) {
      state.totalCostUsd = resultEvent.cost_usd;
    }
    if (resultEvent.result) {
      state.finalSummary = resultEvent.result;
      console.log(`[cli-runner] Agent ${agent.id} result: ${resultEvent.result.slice(0, 200)}`);
    }
    if (resultEvent.is_error) {
      console.warn(`[cli-runner] Agent ${agent.id} result was an error: ${resultEvent.result}`);
    }
    if (!resultEvent.is_error && resultEvent.result) {
      state.completionState.completed = true;
      state.completionState.summary = resultEvent.result;
      if (state.finalSummary && state.finalSummary.length > 50) {
        state.completionState.handoffContent = state.finalSummary;
      }
      console.log(`[cli-runner] Agent ${agent.id} auto-completed (result event received)`);
    }
  }
}

function parseOpenCodeEvent(
  line: string,
  agent: AgentIdentity,
  task: Task,
  deps: RunnerDeps,
  state: { finalSummary: string; totalCostUsd: number; completionState: CompletionState },
): void {
  let event: OpenCodeEvent;
  try {
    event = JSON.parse(line) as OpenCodeEvent;
  } catch {
    return;
  }

  // Text content from assistant
  if (event.type === 'text' && event.text?.content) {
    state.finalSummary = event.text.content;
  }

  // Tool calls
  if (event.type === 'tool_call' && event.tool?.name) {
    deps.sseBroadcaster.emit('agent-tool-use', {
      agentId: agent.id,
      taskId: task.id,
      tool: event.tool.name,
      timestamp: new Date().toISOString(),
    });
  }

  // Error events
  if (event.type === 'error') {
    const msg = event.error?.data?.message ?? event.error?.name ?? 'unknown error';
    console.warn(`[cli-runner] Agent ${agent.id} opencode error: ${msg.slice(0, 200)}`);
  }

  // Completion / result
  if (event.type === 'result' && event.result) {
    if (event.result.cost_usd) {
      state.totalCostUsd = event.result.cost_usd;
    }
    if (event.result.content) {
      state.finalSummary = event.result.content;
      state.completionState.completed = true;
      state.completionState.summary = event.result.content;
      if (state.finalSummary.length > 50) {
        state.completionState.handoffContent = state.finalSummary;
      }
      console.log(`[cli-runner] Agent ${agent.id} auto-completed (opencode result)`);
    }
  }

  // OpenCode emits "done" when the session finishes
  if (event.type === 'done') {
    if (!state.completionState.completed && state.finalSummary) {
      state.completionState.completed = true;
      state.completionState.summary = state.finalSummary;
      if (state.finalSummary.length > 50) {
        state.completionState.handoffContent = state.finalSummary;
      }
      console.log(`[cli-runner] Agent ${agent.id} auto-completed (opencode done event)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared completion state type
// ---------------------------------------------------------------------------

interface CompletionState {
  completed: boolean;
  summary: string;
  handoffContent: string | null;
}

// ---------------------------------------------------------------------------
// runAgentLoop
// ---------------------------------------------------------------------------

export async function runAgentLoop(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  deps: RunnerDeps,
): Promise<AgentResult> {
  const completionState: CompletionState = {
    completed: false,
    summary: '',
    handoffContent: null,
  };

  const systemPrompt = buildSystemPrompt(agent, context);
  const taskPrompt = buildTaskPrompt(task, context.handoff, context.claudeMd);
  const repoPath = resolveWorkDir(context);
  const backend = getRunnerBackend();

  // MCP server (only for Claude — OpenCode has its own MCP config)
  const mcpServer = backend === 'claude' ? createOrchestratorMcpServer({
    messageBus: deps.messageBus,
    memoryManager: deps.memoryManager,
    db: deps.db,
    agentId: agent.id,
    taskId: task.id,
    projectId: task.projectId,
    completionState,
  }) : null;

  // Build args based on backend
  let bin: string;
  let args: string[];
  let modelId: string;

  if (backend === 'opencode') {
    bin = getOpenCodeBinaryPath();
    args = buildOpenCodeArgs(agent, systemPrompt, taskPrompt);
    modelId = resolveOpenCodeModel(agent.model);
    console.log(`[cli-runner] Using OpenCode backend for ${agent.id} (model: ${modelId})`);
  } else {
    bin = getClaudeBinaryPath();
    args = buildClaudeArgs(agent, systemPrompt, taskPrompt, mcpServer);
    modelId = resolveClaudeModel(agent.model);
    console.log(`[cli-runner] Using Claude backend for ${agent.id} (model: ${modelId})`);
  }

  const parseEvent = backend === 'opencode' ? parseOpenCodeEvent : parseClaudeEvent;

  return new Promise<AgentResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: repoPath,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Register kill handle so orchestrator can cancel running agents
    deps.onProcessSpawned?.(() => {
      if (!child.killed) {
        child.kill();
        console.log(`[cli-runner] Agent ${agent.id} process killed (task cancelled)`);
      }
    });

    const state = {
      finalSummary: '',
      totalCostUsd: 0,
      completionState,
    };

    let stderr = '';
    let resolved = false;
    let resultTimeout: ReturnType<typeof setTimeout> | null = null;

    function resolveOnce(result: AgentResult) {
      if (resolved) return;
      resolved = true;
      if (resultTimeout) clearTimeout(resultTimeout);
      resolve(result);
    }

    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        parseEvent(trimmed, agent, task, deps, state);
      }

      // If we got a result event but process hasn't exited, set a kill timer
      if (completionState.completed && !resultTimeout) {
        resultTimeout = setTimeout(() => {
          if (!child.killed) {
            console.log(`[cli-runner] Agent ${agent.id} process didn't exit after result — killing`);
            child.kill();
          }
          resolveOnce({
            summary: completionState.summary || state.finalSummary,
            handoffContent: completionState.handoffContent,
            completedViaSignal: completionState.completed,
          });
        }, 15_000);
      }
    });

    child.on('close', (code) => {
      // Track cost if we got one
      if (state.totalCostUsd > 0) {
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
        console.warn(`[cli-runner] Agent ${agent.id} ${backend} CLI exited with code ${code}. stderr: ${stderr.slice(0, 500)}`);
      }

      resolveOnce({
        summary: completionState.summary || state.finalSummary,
        handoffContent: completionState.handoffContent,
        completedViaSignal: completionState.completed,
      });
    });

    child.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn ${backend} CLI: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// runAgentWithErrorHandling
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      const backoff = 2000 * retries;
      const backend = getRunnerBackend();
      console.log(`[cli-runner] Agent ${agent.id} attempt ${retries} failed, retrying in ${backoff}ms: ${error instanceof Error ? error.message : error}`);
      await sleep(backoff);
    }
  }
}
