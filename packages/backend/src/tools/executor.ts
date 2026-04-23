import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { AgentIdentity, Task, ToolConfig } from '@agentic-dev/shared';
import type { DB } from '../db';
import { ProjectRepository } from '../db/repositories/project.repository';
import type { MessageBus } from '../messaging';
import { Sandbox } from './sandbox';
import { PermissionMatrix } from './permissions';
import { ReadFileHandler, WriteFileHandler, ListFilesHandler, SearchFilesHandler } from './file-tools';
import { GitStatusHandler, GitBranchHandler, GitCommitHandler, GitPushHandler, CreatePrHandler } from './git-tools';
import { RunCommandHandler, RunTestsHandler, CheckCoverageHandler } from './command-tools';
import { BeadsCreateHandler, BeadsUpdateHandler, BeadsListHandler } from './beads-tools';
import { SendMessageHandler, SignalCompleteHandler } from './signal-tools';
import {
  CreateMemoryHandler,
  ReadMemoriesHandler,
  UpdateMemoryHandler,
  DeleteMemoryHandler,
} from './memory-tools';
import type { MemoryManager } from '../memory';
import type { ToolHandler } from '@agentic-dev/shared';

// ---------------------------------------------------------------------------
// Orchestrator interface — minimal surface used by ToolExecutor
// ---------------------------------------------------------------------------

/**
 * Minimal interface for the orchestrator.  The full implementation lives in
 * a separate module that hasn't been built yet; ToolExecutor only needs this
 * subset at call time.
 */
export interface Orchestrator {
  // Reserved for future use — e.g. orchestrator.interrupt(agentId)
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// ToolExecutor
// ---------------------------------------------------------------------------

export class ToolExecutor {
  private readonly sandbox: Sandbox;
  private readonly permissions: PermissionMatrix;
  private readonly handlers: Record<string, ToolHandler>;
  private readonly projectRepo: ProjectRepository;

  constructor(
    private readonly db: DB,
    private readonly config: ToolConfig,
    messageBus: MessageBus,
    memoryManager: MemoryManager,
  ) {
    this.sandbox = new Sandbox(config);
    this.permissions = new PermissionMatrix();
    this.projectRepo = new ProjectRepository(db);

    this.handlers = {
      read_file: new ReadFileHandler(this.sandbox),
      write_file: new WriteFileHandler(this.sandbox),
      list_files: new ListFilesHandler(this.sandbox),
      search_files: new SearchFilesHandler(this.sandbox),
      run_command: new RunCommandHandler(this.sandbox, config),
      git_status: new GitStatusHandler(this.sandbox),
      git_branch: new GitBranchHandler(this.sandbox),
      git_commit: new GitCommitHandler(this.sandbox),
      git_push: new GitPushHandler(this.sandbox),
      create_pr: new CreatePrHandler(this.sandbox),
      run_tests: new RunTestsHandler(this.sandbox, config, db),
      check_coverage: new CheckCoverageHandler(this.sandbox, config, db),
      send_message: new SendMessageHandler(messageBus),
      signal_complete: new SignalCompleteHandler(),
      beads_create: new BeadsCreateHandler(this.sandbox),
      beads_update: new BeadsUpdateHandler(this.sandbox),
      beads_list: new BeadsListHandler(this.sandbox),
      create_memory: new CreateMemoryHandler(memoryManager),
      read_memories: new ReadMemoriesHandler(memoryManager),
      update_memory: new UpdateMemoryHandler(memoryManager),
      delete_memory: new DeleteMemoryHandler(memoryManager),
    };
  }

  /**
   * Execute a single tool call from an agent.
   *
   * 1. Checks permission for the agent's role.
   * 2. Resolves the project repo path from the task.
   * 3. Dispatches to the appropriate handler.
   * 4. Returns a ToolResultBlockParam for inclusion in the next API message.
   */
  async execute(
    agent: AgentIdentity,
    task: Task,
    toolUse: ToolUseBlock,
    _orchestrator: Orchestrator,
  ): Promise<ToolResultBlockParam> {
    const { name, input, id } = toolUse;

    // 1. Permission check
    if (!this.permissions.isAllowed(agent.role, name)) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Permission denied: ${agent.role} cannot use ${name}`,
        is_error: true,
      };
    }

    // 2. Resolve project path
    const project = await this.projectRepo.findById(task.projectId);
    const repoPath = project?.path ?? '';

    if (!repoPath) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Project not found or has no path: ${task.projectId}`,
        is_error: true,
      };
    }

    // 3. Execute handler
    const handler = this.handlers[name];
    if (!handler) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `No handler registered for tool: ${name}`,
        is_error: true,
      };
    }

    try {
      const result = await handler.execute(input as Record<string, unknown>, {
        agentId: agent.id,
        agentRole: agent.role,
        taskId: task.id,
        repoPath,
      });

      return {
        type: 'tool_result',
        tool_use_id: id,
        content: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Error: ${message}`,
        is_error: true,
      };
    }
  }
}
