# LLD-005: Tool Execution Layer

**References:** ADR-0008

## Overview

The tool execution layer validates, sandboxes, and executes tool calls from agents. It enforces per-role permissions, path validation, command categorization, and timeouts.

## File Structure

```
packages/backend/src/
  tools/
    index.ts                # Tool registry and executor
    executor.ts             # Main execution dispatcher
    permissions.ts          # Permission matrix and validation
    file-tools.ts           # read_file, write_file, list_files, search_files
    git-tools.ts            # git_status, git_branch, git_commit, git_push, create_pr
    command-tools.ts        # run_command, run_tests, check_coverage
    beads-tools.ts          # beads_create, beads_update, beads_list
    memory-tools.ts         # create_memory, read_memories, update_memory, delete_memory
    sandbox.ts              # Path validation, command categorization, sensitive file checks
    tool-definitions.ts     # Anthropic API tool schemas per agent role
```

## Tool Executor

```typescript
// executor.ts

class ToolExecutor {
  private sandbox: Sandbox;
  private permissions: PermissionMatrix;
  private handlers: Record<string, ToolHandler>;

  constructor(private db: DB, private config: ToolConfig) {
    this.sandbox = new Sandbox(config);
    this.permissions = new PermissionMatrix();
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
      send_message: new SendMessageHandler(),
      signal_complete: new SignalCompleteHandler(),
      beads_create: new BeadsCreateHandler(this.sandbox),
      beads_update: new BeadsUpdateHandler(this.sandbox),
      beads_list: new BeadsListHandler(this.sandbox),
      create_memory: new CreateMemoryHandler(db),
      read_memories: new ReadMemoriesHandler(db),
      update_memory: new UpdateMemoryHandler(db),
      delete_memory: new DeleteMemoryHandler(db),
    };
  }

  async execute(
    agent: AgentIdentity,
    task: Task,
    toolUse: ToolUseBlock,
    orchestrator: Orchestrator
  ): Promise<ToolResultBlockParam> {
    const { name, input, id } = toolUse;

    // 1. Check permission
    if (!this.permissions.isAllowed(agent.id, name)) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Permission denied: ${agent.role} cannot use ${name}`,
        is_error: true,
      };
    }

    // 2. Get project path for file/command tools
    const project = await this.db.projects.findById(task.projectId);
    const repoPath = project?.path;

    // 3. Execute with error handling
    try {
      const result = await this.handlers[name].execute(input, {
        agentId: agent.id,
        agentRole: agent.role,
        taskId: task.id,
        repoPath,
      });

      return { type: 'tool_result', tool_use_id: id, content: result };
    } catch (error) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Error: ${error.message}`,
        is_error: true,
      };
    }
  }
}
```

## Sandbox

```typescript
// sandbox.ts

// Default sensitive file patterns — can be overridden per-project via project.config.sensitivePatterns
const DEFAULT_SENSITIVE_PATTERNS = [
  /^\.env$/,
  /\.env\.local$/,
  /\.env\.production$/,
  /^credentials\.json$/i,
  /^credentials\.ya?ml$/i,
  /\.pem$/,
  /\.key$/,
  /^\.secret/i,
  /\.secret\./i,
  /\.pfx$/,
];

const READABLE_EXCEPTIONS = [
  /\.env\.example$/,
  /\.env\.template$/,
];

function getSensitivePatterns(projectConfig?: ProjectConfig): RegExp[] {
  const overrides = projectConfig?.sensitivePatterns;
  if (overrides && Array.isArray(overrides)) {
    return overrides.map((p: string) => new RegExp(p));
  }
  return DEFAULT_SENSITIVE_PATTERNS;
}

const DENIED_COMMANDS = [
  /^rm\s+(-rf?|--recursive)/,
  /^git\s+push\s+--force/,
  /^git\s+reset\s+--hard/,
  /^git\s+clean\s+-f/,
  /DROP\s+TABLE/i,
  /DROP\s+DATABASE/i,
  /^shutdown/,
  /^reboot/,
  /^kill\s+-9/,
  /^chmod\s+777/,
  /^curl.*\|.*sh$/,
];

const COMMAND_CATEGORIES: Record<string, RegExp[]> = {
  build: [/^npm\s+(run\s+)?build/, /^npx\s/, /^go\s+build/, /^swift\s+build/, /^tsc/],
  test: [/^npm\s+(run\s+)?test/, /^npx\s+(vitest|jest|playwright)/, /^go\s+test/, /^pytest/],
  lint: [/^npx\s+(eslint|prettier|biome)/, /^npm\s+run\s+lint/],
  git: [/^git\s+(status|diff|log|show|branch|stash)/],
  package: [/^npm\s+(install|ci|update)/, /^go\s+mod/, /^pip\s+install/],
  docs: [/^npx\s+(typedoc|mkdocs)/, /^npm\s+run\s+docs/],
};

const AUTOFIX_FLAGS = ['--fix', '--write', '-w', '--fix-type'];

class Sandbox {
  constructor(private config: ToolConfig) {}

  validatePath(filePath: string, repoPath: string): void {
    if (!path.isAbsolute(repoPath)) {
      throw new SandboxError(`repoPath must be absolute, got: ${repoPath}`);
    }
    const resolved = path.resolve(repoPath, filePath);
    if (!resolved.startsWith(repoPath)) {
      throw new SandboxError(`Path traversal attempt: ${filePath}`);
    }
  }

  isSensitiveFile(filePath: string, projectConfig?: ProjectConfig): boolean {
    const basename = path.basename(filePath);
    if (READABLE_EXCEPTIONS.some(p => p.test(basename))) return false;
    const patterns = getSensitivePatterns(projectConfig);
    return patterns.some(p => p.test(basename));
  }

  validateCommand(command: string, agentRole: string): string {
    // Check denylist
    for (const pattern of DENIED_COMMANDS) {
      if (pattern.test(command)) {
        throw new SandboxError(`Denied command: ${command}`);
      }
    }

    // Categorize command
    const category = this.categorizeCommand(command);
    if (!category) {
      throw new SandboxError(`Unknown command category: ${command}. Add to command categories or contact operator.`);
    }

    // Tech Lead: only test and lint categories allowed
    if (agentRole === 'Tech Lead') {
      if (!['test', 'lint'].includes(category)) {
        throw new SandboxError(`Tech Lead can only run test and lint commands, not ${category}`);
      }
      // Strip autofix flags from lint commands
      if (category === 'lint') {
        return this.stripAutofixFlags(command);
      }
    }

    // Doc agent: only docs category
    if (agentRole === 'Documentation Agent' && category !== 'docs') {
      throw new SandboxError(`Documentation Agent can only run docs commands, not ${category}`);
    }

    return command;
  }

  private categorizeCommand(command: string): string | null {
    for (const [category, patterns] of Object.entries(COMMAND_CATEGORIES)) {
      if (patterns.some(p => p.test(command))) return category;
    }
    return null;
  }

  private stripAutofixFlags(command: string): string {
    const parts = command.split(/\s+/);
    return parts.filter(p => !AUTOFIX_FLAGS.includes(p)).join(' ');
  }
}
```

## File Tools

```typescript
// file-tools.ts

class ReadFileHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: { path: string }, ctx: ToolContext): Promise<string> {
    this.sandbox.validatePath(input.path, ctx.repoPath);

    const fullPath = path.join(ctx.repoPath, input.path);
    if (this.sandbox.isSensitiveFile(input.path)) {
      throw new SandboxError(`Cannot read sensitive file: ${input.path}`);
    }

    const content = await fs.readFile(fullPath, 'utf-8');

    // Truncate very large files
    if (content.length > 100_000) {
      return content.slice(0, 100_000) + '\n\n[Truncated — file exceeds 100K characters]';
    }

    return content;
  }
}

class WriteFileHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: { path: string; content: string }, ctx: ToolContext): Promise<string> {
    this.sandbox.validatePath(input.path, ctx.repoPath);

    if (this.sandbox.isSensitiveFile(input.path)) {
      throw new SandboxError(`Cannot write sensitive file: ${input.path}`);
    }

    // Architect: restrict to docs/ directories
    if (ctx.agentRole === 'Architect') {
      if (!input.path.startsWith('docs/')) {
        throw new SandboxError('Architect can only write to docs/ directories');
      }
    }

    const fullPath = path.join(ctx.repoPath, input.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.content, 'utf-8');
    return `File written: ${input.path}`;
  }
}
```

## Command Tools

```typescript
// command-tools.ts

import { spawn } from 'child_process';
import { parse as shellParse } from 'shell-quote';

class RunCommandHandler implements ToolHandler {
  constructor(private sandbox: Sandbox, private config: ToolConfig) {}

  async execute(input: { command: string }, ctx: ToolContext): Promise<string> {
    // Validate and possibly modify command
    const command = this.sandbox.validateCommand(input.command, ctx.agentRole);

    // Use shell-quote for proper argument parsing (handles quotes, escapes, etc.)
    const parsed = shellParse(command).filter((t): t is string => typeof t === 'string');
    const [cmd, ...args] = parsed;

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: ctx.repoPath,
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      // SIGTERM → wait 5s → SIGKILL escalation for timeout
      const timeoutMs = this.config.commandTimeoutMs; // Default: 120_000
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5_000);
      }, timeoutMs);

      child.on('close', (code, signal) => {
        clearTimeout(timer);

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
          return;
        }

        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');

        if (code !== 0) {
          reject(new Error(`Exit code ${code}: ${stderr || stdout || '(no output)'}`));
          return;
        }

        // Truncate large output
        if (output.length > 50_000) {
          resolve(output.slice(0, 50_000) + '\n\n[Truncated — output exceeds 50K characters]');
          return;
        }

        resolve(output || '(no output)');
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn command: ${err.message}`));
      });
    });
  }
}

class RunTestsHandler implements ToolHandler {
  constructor(
    private sandbox: Sandbox,
    private config: ToolConfig,
    private db: DB
  ) {}

  async execute(input: { command?: string }, ctx: ToolContext): Promise<string> {
    const runCommand = new RunCommandHandler(this.sandbox, this.config);
    const output = await runCommand.execute(
      { command: input.command || 'npm test -- --coverage --json' },
      ctx
    );

    // Parse test output and write results to task.metadata
    const parsed = this.parseTestOutput(output);
    const task = await this.db.tasks.findById(ctx.taskId);
    const metadata = JSON.parse(task.metadata || '{}');

    metadata.allTestsPassing = parsed.allPassed;
    metadata.unitCoverage = parsed.coveragePercent;
    metadata.testSuites = parsed.suiteCount;
    metadata.testsPassed = parsed.passCount;
    metadata.testsFailed = parsed.failCount;

    await this.db.tasks.update(ctx.taskId, {
      metadata: JSON.stringify(metadata),
    });

    return output;
  }

  private parseTestOutput(output: string): TestResults {
    try {
      // Try JSON parse first (jest --json output)
      const json = JSON.parse(output);
      return {
        allPassed: json.success ?? false,
        coveragePercent: json.coverageMap?.total?.statements?.pct ?? 0,
        suiteCount: json.numTotalTestSuites ?? 0,
        passCount: json.numPassedTests ?? 0,
        failCount: json.numFailedTests ?? 0,
      };
    } catch {
      // Fallback: regex-based parsing for non-JSON output
      const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)/);
      const passMatch = output.match(/(\d+)\s+pass/i);
      const failMatch = output.match(/(\d+)\s+fail/i);
      return {
        allPassed: !failMatch || parseInt(failMatch[1]) === 0,
        coveragePercent: coverageMatch ? parseFloat(coverageMatch[1]) : 0,
        suiteCount: 0,
        passCount: passMatch ? parseInt(passMatch[1]) : 0,
        failCount: failMatch ? parseInt(failMatch[1]) : 0,
      };
    }
  }
}

class CheckCoverageHandler implements ToolHandler {
  constructor(
    private sandbox: Sandbox,
    private config: ToolConfig,
    private db: DB
  ) {}

  async execute(input: { type: 'unit' | 'integration' | 'e2e_api' | 'e2e_ui' }, ctx: ToolContext): Promise<string> {
    const runCommand = new RunCommandHandler(this.sandbox, this.config);
    const output = await runCommand.execute(
      { command: `npm run coverage:${input.type} -- --json` },
      ctx
    );

    // Parse coverage and write to task.metadata
    const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)/);
    const coveragePercent = coverageMatch ? parseFloat(coverageMatch[1]) : 0;

    const task = await this.db.tasks.findById(ctx.taskId);
    const metadata = JSON.parse(task.metadata || '{}');

    // Map coverage type to metadata key (matches guard expectations in LLD-003)
    const metaKey: Record<string, string> = {
      unit: 'unitCoverage',
      integration: 'integrationCoverage',
      e2e_api: 'e2eApiCoverage',
      e2e_ui: 'e2eUiCoverage',
    };
    metadata[metaKey[input.type]] = coveragePercent;

    await this.db.tasks.update(ctx.taskId, {
      metadata: JSON.stringify(metadata),
    });

    return output;
  }
}
```

## Message and Signal Handlers

```typescript
// message-tools.ts

class SendMessageHandler implements ToolHandler {
  async execute(
    input: { to: string; content: string },
    ctx: ToolContext
  ): Promise<string> {
    // Route to MessageBus.sendBlocking — blocks until recipient responds
    const response = await MessageBus.sendBlocking({
      from: ctx.agentId,
      to: input.to,
      content: input.content,
      taskId: ctx.taskId,
    });

    return response.content;
  }
}

// Special result type that the agent runner loop recognizes as task completion
interface SignalCompleteResult {
  __signal: 'complete';
  summary: string;
  handoffContent: string;
}

class SignalCompleteHandler implements ToolHandler {
  async execute(
    input: { summary: string; handoff_content: string },
    ctx: ToolContext
  ): Promise<string> {
    // Return a special result that the agent runner loop checks for
    // When detected, the runner:
    //   1. Stops the agent's message loop
    //   2. Creates a handoff document from handoff_content
    //   3. Triggers pipeline.advance(taskId, agentId)
    const result: SignalCompleteResult = {
      __signal: 'complete',
      summary: input.summary,
      handoffContent: input.handoff_content,
    };
    return JSON.stringify(result);
  }
}
```

## Tool Definitions for Anthropic API

```typescript
// tool-definitions.ts

function getToolsForAgent(agent: AgentIdentity): Tool[] {
  const allTools: Record<string, Tool> = {
    read_file: {
      name: 'read_file',
      description: 'Read the contents of a file from the project repository',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from project root' },
        },
        required: ['path'],
      },
    },
    write_file: {
      name: 'write_file',
      description: 'Write content to a file in the project repository',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from project root' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    },
    run_command: {
      name: 'run_command',
      description: 'Execute a shell command in the project directory',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to execute' },
        },
        required: ['command'],
      },
    },
    send_message: {
      name: 'send_message',
      description: 'Send a blocking message to another agent and wait for their response',
      input_schema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Agent ID to send to' },
          content: { type: 'string', description: 'Message content' },
        },
        required: ['to', 'content'],
      },
    },
    signal_complete: {
      name: 'signal_complete',
      description: 'Signal that you have completed your work on this task',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of work completed' },
          handoff_content: { type: 'string', description: 'Handoff document for the next stage' },
        },
        required: ['summary', 'handoff_content'],
      },
    },
    // ... remaining tool definitions
  };

  // Filter to only tools this agent is allowed to use
  return agent.allowedTools
    .map(name => allTools[name])
    .filter(Boolean);
}
```
