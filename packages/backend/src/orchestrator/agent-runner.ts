/**
 * agent-runner.ts — the per-task Anthropic SDK message loop.
 *
 * runAgentLoop:   core loop (messages.create → tool calls → repeat)
 * runAgentWithErrorHandling: retry logic, cost circuit breaker, loop detection
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { AgentIdentity, Task as SharedTask } from '@agentic-dev/shared';
import type { Task } from '../db/schema/tasks';
import { getToolsForAgent } from '../tools';
import { buildSystemPrompt, buildTaskPrompt, estimateTokens, type AgentContext } from './context-builder';
import { CostLimitError } from './cost-tracker';
import { LoopDetectedError } from './loop-detector';
import type { Orchestrator } from './orchestrator';

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
// Error types
// ---------------------------------------------------------------------------

export class InvalidOutputError extends Error {
  readonly code = 'INVALID_OUTPUT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

export class ApiError extends Error {
  readonly code = 'API_ERROR' as const;
  readonly isTransient: boolean;
  readonly statusCode: number | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(
    message: string,
    options: {
      isTransient: boolean;
      statusCode?: number;
      headers?: Record<string, string>;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.isTransient = options.isTransient;
    this.statusCode = options.statusCode;
    this.headers = options.headers;
  }
}

// ---------------------------------------------------------------------------
// Corrective prompts — injected on repeated invalid output
// ---------------------------------------------------------------------------

const CORRECTIVE_PROMPTS: Record<number, string> = {
  1: 'Your previous response could not be parsed. Please ensure you either call signal_complete to finish the task, or continue using the available tools.',
  2: 'You have produced invalid output twice. Please call signal_complete now with a summary of what you have accomplished so far.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModel(model: AgentIdentity['model']): string {
  return model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
}

/**
 * Extract text content from a list of content blocks.
 */
export function extractTextContent(
  content: Anthropic.Messages.ContentBlock[],
): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Parse the final assistant response into an AgentResult.
 * Checks whether the signal_complete tool was the last tool called.
 */
function parseAgentResult(
  content: Anthropic.Messages.ContentBlock[],
  completedViaSignal: boolean,
  handoffContent: string | null,
): AgentResult {
  const summary = extractTextContent(content);
  return { summary, handoffContent, completedViaSignal };
}

/**
 * Rough token estimate for the full message history.
 * Used to decide when to summarise.
 */
function estimateMessageTokens(messages: MessageParam[]): number {
  return estimateTokens(JSON.stringify(messages));
}

/**
 * Summarise a long conversation by calling the API with a summarisation prompt.
 * Returns a new two-message history: the original system context and a summary.
 */
async function summarizeConversation(
  messages: MessageParam[],
  anthropic: Anthropic,
  model: string,
): Promise<MessageParam[]> {
  const conversationText = messages
    .map((m) => `[${m.role}]: ${JSON.stringify(m.content)}`)
    .join('\n\n');

  const summaryResponse = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system:
      'You are a conversation summariser. Produce a concise summary of the conversation ' +
      'below, preserving: what the agent was asked to do, what tools were called and their ' +
      'results, what has been completed, and what still needs to be done. Be specific about ' +
      'file names, function names, and any decisions made.',
    messages: [
      {
        role: 'user',
        content: `Summarise this agent conversation:\n\n${conversationText}`,
      },
    ],
  });

  const summaryText = extractTextContent(summaryResponse.content);

  // Return a condensed two-turn history with the summary as user context
  return [
    {
      role: 'user',
      content:
        `[CONVERSATION SUMMARY — previous turns condensed]\n\n${summaryText}\n\n` +
        `[END SUMMARY — continue the task from here]`,
    },
  ];
}

// ---------------------------------------------------------------------------
// runAgentLoop
// ---------------------------------------------------------------------------

/**
 * Core agent run loop. Calls messages.create in a cycle, processing tool calls
 * until the model returns end_turn (task complete) or throws.
 *
 * Mutates orchestrator.agents state for the given agent (conversationMessages, etc.)
 * so that interruptAgent() can snapshot and restore.
 */
export async function runAgentLoop(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  orchestrator: Orchestrator,
): Promise<AgentResult> {
  const anthropic = new Anthropic();
  const modelId = resolveModel(agent.model);

  // Build system prompt
  const systemPrompt = buildSystemPrompt(agent, context);

  // Store in orchestrator state for interrupt/resume support
  const agentState = orchestrator.agents.get(agent.id);
  if (agentState) {
    agentState.systemPrompt = systemPrompt;
  }

  // Build initial messages
  let messages: MessageParam[] = [];

  // If there's an existing conversation to resume, use it
  if (agentState?.conversationMessages && agentState.conversationMessages.length > 0) {
    messages = agentState.conversationMessages as MessageParam[];
  } else {
    // Initial user message with task context
    messages.push({
      role: 'user',
      content: buildTaskPrompt(task, context.handoff, context.claudeMd),
    });
  }

  // If a corrective message was injected (after invalid output), append it
  if (context.correctiveMessage) {
    messages.push({ role: 'user', content: context.correctiveMessage });
  }

  let completedViaSignal = false;
  let handoffContent: string | null = null;

  while (true) {
    // Sync conversation state into orchestrator (for interrupt snapshots)
    if (agentState) {
      agentState.conversationMessages = messages;
    }

    // Cost circuit breaker — throws CostLimitError if over budget
    await orchestrator.costTracker.checkBudget(task.id);

    // Make API call
    const startTime = Date.now();
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 8192,
      system: systemPrompt,
      tools: getToolsForAgent(agent),
      messages,
    });
    const latencyMs = Date.now() - startTime;

    // Track API call cost
    await orchestrator.costTracker.trackCall({
      agentId: agent.id,
      taskId: task.id,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      latencyMs,
      status: 'success',
    });

    // Add assistant response to conversation
    messages.push({ role: 'assistant', content: response.content });

    // Check for end_turn (task complete without signal_complete tool)
    if (response.stop_reason === 'end_turn') {
      return parseAgentResult(response.content, completedViaSignal, handoffContent);
    }

    // Process tool calls
    if (response.stop_reason === 'tool_use') {
      const toolResults: ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        // Record the call (throws LoopDetectedError if stuck in a loop)
        orchestrator.loopDetector.record(agent.id, block);

        // Check if this is the signal_complete tool
        if (block.name === 'signal_complete') {
          completedViaSignal = true;
          const input = block.input as Record<string, unknown>;
          handoffContent = (input['handoff_content'] as string | null) ?? null;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: 'Task completion signalled. The pipeline will advance to the next stage.',
          });

          // Add results and break out of the tool loop to return
          messages.push({ role: 'user', content: toolResults });
          return parseAgentResult(response.content, completedViaSignal, handoffContent);
        }

        // Execute tool via sandboxed executor.
        // Two casts are needed:
        //   1. DB schema Task → shared Task (same shape, different stage type)
        //   2. Orchestrator class → ToolExecutor's Orchestrator interface
        //      (executor only needs an index signature; our class satisfies at runtime)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await orchestrator.toolExecutor.execute(
          agent,
          task as unknown as SharedTask,
          block,
          orchestrator as unknown as import('../tools/executor').Orchestrator,
        );

        // Record result for loop detection
        const resultContent =
          typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
        orchestrator.loopDetector.recordResult(agent.id, block, resultContent);

        toolResults.push(result);
      }

      // Add tool results to conversation
      messages.push({ role: 'user', content: toolResults });
    }

    // Check if conversation is getting long — summarise if needed
    if (estimateMessageTokens(messages) > 150_000) {
      messages = await summarizeConversation(messages, anthropic, modelId);
    }
  }
}

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

function calculateBackoff(
  attempt: number,
  options: { base: number; max: number; jitter: number },
): number {
  const exponential = Math.min(options.base * Math.pow(2, attempt - 1), options.max);
  const jitter = exponential * options.jitter * Math.random();
  return Math.floor(exponential + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// runAgentWithErrorHandling
// ---------------------------------------------------------------------------

/**
 * Wraps runAgentLoop with:
 *   - Exponential backoff retry for transient API errors (max 5 retries)
 *   - Retry-After header respect on 429 responses
 *   - Semaphore.reduceMax() on 429 to back off system-wide concurrency
 *   - Invalid output retry with corrective prompt (max 2 retries)
 *   - CostLimitError → agent paused state
 *   - LoopDetectedError → agent error state
 *   - Unknown errors → agent error state
 */
export async function runAgentWithErrorHandling(
  agent: AgentIdentity,
  task: Task,
  context: AgentContext,
  orchestrator: Orchestrator,
): Promise<AgentResult> {
  let retries = 0;
  let invalidOutputCount = 0;
  const runContext = { ...context };

  while (true) {
    try {
      return await runAgentLoop(agent, task, runContext, orchestrator);
    } catch (error) {
      // ---------------------------------------------------------------
      // Transient API errors (rate limits, server errors) — retry with backoff
      // ---------------------------------------------------------------
      if (isTransientError(error)) {
        retries++;
        if (retries > 5) {
          await orchestrator.setAgentStatus(agent.id, 'error');
          orchestrator.sseBroadcaster.emit('agent-error', {
            agentId: agent.id,
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        let delay: number;
        const statusCode = getStatusCode(error);
        const headers = getHeaders(error);

        if (statusCode === 429 && headers?.['retry-after']) {
          delay = parseInt(headers['retry-after'], 10) * 1000;
          orchestrator.semaphore.reduceMax();
        } else {
          delay = calculateBackoff(retries, { base: 1000, max: 60_000, jitter: 0.3 });
        }

        // Track the failed call if we have enough info
        try {
          await orchestrator.costTracker.trackCall({
            agentId: agent.id,
            taskId: task.id,
            model: resolveModel(agent.model),
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            latencyMs: 0,
            status: statusCode === 429 ? 'rate_limited' : 'error',
            errorCode: statusCode?.toString() ?? null,
          });
        } catch {
          // Best-effort tracking — don't let it hide the original error
        }

        await sleep(delay);
        continue;
      }

      // ---------------------------------------------------------------
      // Invalid output — retry with corrective prompt (max 2 times)
      // ---------------------------------------------------------------
      if (error instanceof InvalidOutputError) {
        invalidOutputCount++;
        if (invalidOutputCount >= 3) {
          await orchestrator.setAgentStatus(agent.id, 'error');
          throw error;
        }
        runContext.correctiveMessage = CORRECTIVE_PROMPTS[invalidOutputCount] ?? null;
        continue;
      }

      // ---------------------------------------------------------------
      // Cost limit exceeded — pause the agent
      // ---------------------------------------------------------------
      if (error instanceof CostLimitError) {
        await orchestrator.setAgentStatus(agent.id, 'paused');
        orchestrator.sseBroadcaster.emit('agent-error', {
          agentId: agent.id,
          taskId: task.id,
          error: error.message,
        });
        throw error;
      }

      // ---------------------------------------------------------------
      // Loop detected — fail to error state
      // ---------------------------------------------------------------
      if (error instanceof LoopDetectedError) {
        await orchestrator.setAgentStatus(agent.id, 'error');
        orchestrator.sseBroadcaster.emit('agent-error', {
          agentId: agent.id,
          taskId: task.id,
          error: error.message,
        });
        throw error;
      }

      // ---------------------------------------------------------------
      // Unknown error — fail to error state
      // ---------------------------------------------------------------
      await orchestrator.setAgentStatus(agent.id, 'error');
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

function isTransientError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    const code = error.status;
    // 429 (rate limit), 500, 502, 503, 529 (overloaded) are transient
    return code === 429 || code === 500 || code === 502 || code === 503 || code === 529;
  }
  return false;
}

function getStatusCode(error: unknown): number | undefined {
  if (error instanceof Anthropic.APIError) {
    return error.status;
  }
  return undefined;
}

function getHeaders(error: unknown): Record<string, string> | undefined {
  if (error instanceof Anthropic.APIError) {
    // Anthropic.APIError exposes headers as a Headers object
    const raw = error.headers;
    if (!raw) return undefined;
    const result: Record<string, string> = {};
    if (typeof raw.forEach === 'function') {
      raw.forEach((value: string, key: string) => {
        result[key] = value;
      });
    }
    return result;
  }
  return undefined;
}
