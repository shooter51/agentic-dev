/**
 * cli-runner.ts — runs agents via the Claude Code CLI.
 *
 * Spawns `claude -p` with the agent's prompt using the user's subscription.
 * No API key needed.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentIdentity } from '@agentic-dev/shared';
import type { Task } from '../db/schema/tasks';
import { buildSystemPrompt, buildTaskPrompt, type AgentContext } from './context-builder';
import type { CostTracker } from './cost-tracker';

const execFileAsync = promisify(execFile);

export interface AgentResult {
  summary: string;
  handoffContent: string | null;
  completedViaSignal: boolean;
}

export async function runAgentLoop(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  orchestrator: { costTracker: CostTracker },
): Promise<AgentResult> {
  const modelFlag = agent.model === 'opus' ? 'opus' : 'sonnet';
  const systemPrompt = buildSystemPrompt(agent, context);
  const taskPrompt = buildTaskPrompt(task, context.handoff, context.claudeMd);
  const fullPrompt = `${systemPrompt}\n\n---\n\n${taskPrompt}`;
  const cwd = context.repoPath || process.cwd();

  console.log(`[CLI-Runner] Running ${agent.id} (${modelFlag}) on task ${task.id} in ${cwd}`);

  const { stdout } = await execFileAsync('claude', [
    '-p', fullPrompt,
    '--model', modelFlag,
    '--output-format', 'json',
    '--max-turns', '50',
    '--dangerously-skip-permissions',
  ], {
    cwd,
    timeout: 600_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env },
  });

  let result: { result?: string; is_error?: boolean; total_cost_usd?: number };
  try {
    result = JSON.parse(stdout);
  } catch {
    console.error(`[CLI-Runner] Failed to parse output for ${agent.id}:`, stdout.slice(0, 500));
    return { summary: stdout.slice(0, 2000), handoffContent: null, completedViaSignal: false };
  }

  if (result.is_error) {
    throw new Error(`Claude Code error: ${result.result ?? 'unknown'}`);
  }

  const summary = result.result ?? '';

  if (result.total_cost_usd) {
    await orchestrator.costTracker.trackCall({
      agentId: agent.id,
      taskId: task.id,
      model: modelFlag === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      latencyMs: 0,
      status: 'success',
    });
  }

  console.log(`[CLI-Runner] ${agent.id} completed. Cost: $${result.total_cost_usd ?? 0}`);

  return {
    summary,
    handoffContent: summary,
    completedViaSignal: true,
  };
}

/**
 * Wrapper with basic error handling. Replaces runAgentWithErrorHandling
 * from the old Anthropic SDK agent-runner.
 */
export async function runAgentWithErrorHandling(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  orchestrator: { costTracker: CostTracker },
): Promise<AgentResult> {
  return runAgentLoop(agent, task, context, orchestrator);
}
