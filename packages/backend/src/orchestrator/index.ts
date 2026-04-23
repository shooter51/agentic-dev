/**
 * orchestrator/index.ts — Fastify plugin registration.
 *
 * Registers the Orchestrator as a Fastify plugin, decorates the instance
 * with `fastify.orchestrator`, and hooks into onReady / onClose for lifecycle.
 *
 * Note: fastify-plugin is not a dependency — we use a plain async function
 * plugin and export the Orchestrator class directly so it can be wired up
 * by the application bootstrap code.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Orchestrator, type OrchestratorConfig, type SSEBroadcaster } from './orchestrator';
import type { TaskPipeline } from '../pipeline';
import type { MessageBus, HandoffService } from '../messaging';
import type { MemoryManager } from '../memory';
import type { ToolExecutor } from '../tools';
import type { DB } from '../db';

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface OrchestratorPluginOptions {
  db: DB;
  messageBus: MessageBus;
  pipeline: TaskPipeline;
  memoryManager: MemoryManager;
  handoffService: HandoffService;
  toolExecutor: ToolExecutor;
  sseBroadcaster: SSEBroadcaster;
  config?: Partial<OrchestratorConfig>;
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

/**
 * Fastify plugin that registers the Orchestrator.
 *
 * Usage:
 *   await fastify.register(orchestratorPlugin, {
 *     db, messageBus, pipeline, memoryManager,
 *     handoffService, toolExecutor, sseBroadcaster,
 *   });
 *
 * After registration, access via: fastify.orchestrator
 */
export const orchestratorPlugin: FastifyPluginAsync<OrchestratorPluginOptions> = async (
  fastify: FastifyInstance,
  options: OrchestratorPluginOptions,
) => {
  const orchestrator = new Orchestrator({
    db: options.db,
    messageBus: options.messageBus,
    pipeline: options.pipeline,
    memoryManager: options.memoryManager,
    handoffService: options.handoffService,
    toolExecutor: options.toolExecutor,
    sseBroadcaster: options.sseBroadcaster,
    config: options.config,
  });

  // Decorate Fastify instance so routes can access the orchestrator
  fastify.decorate('orchestrator', orchestrator);

  // Start the dispatch loop when the server is ready
  fastify.addHook('onReady', async () => {
    await orchestrator.start();
  });

  // Graceful shutdown — stop the dispatch loop and drain in-flight work
  fastify.addHook('onClose', async () => {
    await orchestrator.stop();
  });
};

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { Orchestrator } from './orchestrator';
export type { OrchestratorConfig, SSEBroadcaster } from './orchestrator';
export { AGENT_DEFINITIONS, getAgentDefinition, getAgentsForStage } from './agent-registry';
export { ConcurrencySemaphore } from './concurrency';
export { CostTracker, CostLimitError } from './cost-tracker';
export type { ApiCallRecord, CostTrackerConfig } from './cost-tracker';
export { LoopDetector, LoopDetectedError } from './loop-detector';
export { buildSystemPrompt, buildTaskPrompt, buildInterruptSystemPrompt } from './context-builder';
export type { AgentContext, ContextBudget } from './context-builder';
export { runAgentLoop, runAgentWithErrorHandling, InvalidOutputError, ApiError } from './agent-runner';
export type { AgentResult } from './agent-runner';
