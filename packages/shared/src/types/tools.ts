/**
 * Execution context provided to every tool handler.
 * Gives handlers access to the invoking agent, current task, and repo location.
 */
export interface ToolContext {
  agentId: string;
  agentRole: string;
  taskId: string;
  projectId: string;
  /** Absolute path to the target repository on disk */
  repoPath: string;
}

/**
 * Interface that every tool handler must implement.
 * Input shape is tool-specific and validated before execute() is called.
 */
export interface ToolHandler {
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

/** Configuration consumed by the ToolExecutor and individual handlers */
export interface ToolConfig {
  /** Timeout in milliseconds for run_command executions. Default: 120_000 */
  commandTimeoutMs: number;
  /** Timeout in milliseconds for message bus blocking calls. Default: 600_000 */
  messageTimeoutMs: number;
}
