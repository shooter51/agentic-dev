import { spawn } from 'child_process';
import { parse as shellParse } from 'shell-quote';
import { eq } from 'drizzle-orm';
import type { ToolHandler, ToolContext, ToolConfig } from '@agentic-dev/shared';
import type { Sandbox } from './sandbox';
import type { DB } from '../db';
import { tasks as tasksTable } from '../db/schema/tasks';

// ---------------------------------------------------------------------------
// Internal result type from test output parsing
// ---------------------------------------------------------------------------

interface TestResults {
  allPassed: boolean;
  coveragePercent: number;
  suiteCount: number;
  passCount: number;
  failCount: number;
}

// ---------------------------------------------------------------------------
// RunCommandHandler
// ---------------------------------------------------------------------------

export class RunCommandHandler implements ToolHandler {
  constructor(
    private sandbox: Sandbox,
    private config: ToolConfig,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const rawCommand = input['command'] as string;

    // Validate against denylist and role restrictions; may strip autofix flags.
    const command = this.sandbox.validateCommand(rawCommand, ctx.agentRole);

    // Use shell-quote for proper tokenization (handles quoted args, escapes, etc.)
    const parsed = shellParse(command).filter(
      (t): t is string => typeof t === 'string',
    );

    if (parsed.length === 0) {
      throw new Error('Empty command after parsing');
    }

    const [cmd, ...args] = parsed;

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: ctx.repoPath,
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      // SIGTERM → wait 5 seconds → SIGKILL escalation
      const timeoutMs = this.config.commandTimeoutMs;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        const killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5_000);
        // Ensure the kill timer doesn't keep the process alive if not needed
        killTimer.unref?.();
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

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn command: ${err.message}`));
      });
    });
  }
}

// ---------------------------------------------------------------------------
// RunTestsHandler
// ---------------------------------------------------------------------------

export class RunTestsHandler implements ToolHandler {
  constructor(
    private sandbox: Sandbox,
    private config: ToolConfig,
    private db: DB,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const runCommand = new RunCommandHandler(this.sandbox, this.config);
    const command = (input['command'] as string | undefined) ?? 'npm test -- --coverage --json';

    const output = await runCommand.execute({ command }, ctx);

    // Parse test results and persist to task.metadata
    const parsed = this.parseTestOutput(output);

    const task = await this.db.select().from(tasksTable).where(eq(tasksTable.id, ctx.taskId)).get();
    const metadata: Record<string, unknown> = JSON.parse(task?.metadata ?? '{}');

    metadata['allTestsPassing'] = parsed.allPassed;
    metadata['unitCoverage'] = parsed.coveragePercent;
    metadata['testSuites'] = parsed.suiteCount;
    metadata['testsPassed'] = parsed.passCount;
    metadata['testsFailed'] = parsed.failCount;

    await this.db
      .update(tasksTable)
      .set({ metadata: JSON.stringify(metadata), updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, ctx.taskId));

    return output;
  }

  private parseTestOutput(output: string): TestResults {
    try {
      // Try JSON parse first (jest --json output)
      const json = JSON.parse(output) as Record<string, unknown>;
      const coverageMap = json['coverageMap'] as Record<string, unknown> | undefined;
      const total = coverageMap?.['total'] as Record<string, unknown> | undefined;
      const statements = total?.['statements'] as Record<string, unknown> | undefined;

      return {
        allPassed: (json['success'] as boolean | undefined) ?? false,
        coveragePercent: (statements?.['pct'] as number | undefined) ?? 0,
        suiteCount: (json['numTotalTestSuites'] as number | undefined) ?? 0,
        passCount: (json['numPassedTests'] as number | undefined) ?? 0,
        failCount: (json['numFailedTests'] as number | undefined) ?? 0,
      };
    } catch {
      // Fallback: regex-based parsing for vitest / non-JSON output
      const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)/);
      const passMatch = output.match(/(\d+)\s+pass(?:ed)?/i);
      const failMatch = output.match(/(\d+)\s+fail(?:ed)?/i);

      return {
        allPassed: !failMatch || parseInt(failMatch[1]!, 10) === 0,
        coveragePercent: coverageMatch ? parseFloat(coverageMatch[1]!) : 0,
        suiteCount: 0,
        passCount: passMatch ? parseInt(passMatch[1]!, 10) : 0,
        failCount: failMatch ? parseInt(failMatch[1]!, 10) : 0,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// CheckCoverageHandler
// ---------------------------------------------------------------------------

const COVERAGE_META_KEY: Record<string, string> = {
  unit: 'unitCoverage',
  integration: 'integrationCoverage',
  e2e_api: 'e2eApiCoverage',
  e2e_ui: 'e2eUiCoverage',
};

export class CheckCoverageHandler implements ToolHandler {
  constructor(
    private sandbox: Sandbox,
    private config: ToolConfig,
    private db: DB,
  ) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const type = input['type'] as 'unit' | 'integration' | 'e2e_api' | 'e2e_ui';
    const runCommand = new RunCommandHandler(this.sandbox, this.config);

    const output = await runCommand.execute(
      { command: `npm run coverage:${type} -- --json` },
      ctx,
    );

    // Parse coverage percentage from output
    const coverageMatch = output.match(/All files\s*\|\s*([\d.]+)/);
    const coveragePercent = coverageMatch ? parseFloat(coverageMatch[1]!) : 0;

    // Write to task.metadata under the appropriate key (consumed by pipeline guards)
    const task = await this.db.select().from(tasksTable).where(eq(tasksTable.id, ctx.taskId)).get();
    const metadata: Record<string, unknown> = JSON.parse(task?.metadata ?? '{}');

    const metaKey = COVERAGE_META_KEY[type] ?? `${type}Coverage`;
    metadata[metaKey] = coveragePercent;

    await this.db
      .update(tasksTable)
      .set({ metadata: JSON.stringify(metadata), updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, ctx.taskId));

    return output;
  }
}
