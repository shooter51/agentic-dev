import type { ToolHandler, ToolContext } from '@agentic-dev/shared';
import type { MessageBus } from '../messaging';

// ---------------------------------------------------------------------------
// Special result type — recognised by the agent runner loop
// ---------------------------------------------------------------------------

/**
 * When SignalCompleteHandler returns this structure (JSON-encoded), the agent
 * runner loop:
 *   1. Stops the agent's message loop.
 *   2. Creates a handoff document from `handoffContent`.
 *   3. Calls pipeline.advance(taskId, agentId) to move to the next stage.
 */
export interface SignalCompleteResult {
  __signal: 'complete';
  summary: string;
  handoffContent: string;
}

// ---------------------------------------------------------------------------
// SendMessageHandler
// ---------------------------------------------------------------------------

export class SendMessageHandler implements ToolHandler {
  constructor(private messageBus: MessageBus) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const to = input['to'] as string;
    const content = input['content'] as string;
    const type = (input['type'] as 'clarification' | 'rejection' | undefined) ?? 'clarification';

    if (!to) throw new Error('Recipient agent id (to) is required');
    if (!content) throw new Error('Message content is required');

    // Routes through MessageBus.sendBlocking — blocks until the recipient responds.
    const response = await this.messageBus.sendBlocking(
      ctx.agentId,
      to,
      ctx.taskId,
      type,
      content,
    );

    return response;
  }
}

// ---------------------------------------------------------------------------
// SignalCompleteHandler
// ---------------------------------------------------------------------------

export class SignalCompleteHandler implements ToolHandler {
  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
    const summary = input['summary'] as string;
    const handoffContent = input['handoff_content'] as string;

    if (!summary) throw new Error('summary is required');
    if (!handoffContent) throw new Error('handoff_content is required');

    const result: SignalCompleteResult = {
      __signal: 'complete',
      summary,
      handoffContent,
    };

    return JSON.stringify(result);
  }
}
