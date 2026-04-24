/**
 * self-repair.ts — automated self-healing for failed tasks.
 *
 * When a task exceeds MAX_TASK_RETRIES, this module attempts to diagnose
 * and fix code-level issues by spawning a Claude Opus agent with full
 * access to the target project directory.
 *
 * For the agentic-dev project itself, changes require operator approval
 * before being applied — the diff is surfaced via SSE and reverted.
 */

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import type { DB } from '../db';
import type { SSEBroadcaster } from './orchestrator';
import type { CostTracker } from './cost-tracker';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepairContext {
  taskId: string;
  taskTitle: string;
  taskStage: string;
  taskDescription: string | null;
  projectPath: string;
  projectId: string;
  errorHistory: string[];
  failedAgents: string[];
  isAgenticDevProject: boolean;
}

export interface RepairResult {
  success: boolean;
  diagnosis: string;
  filesChanged: string[];
  commitHash: string | null;
  requiresOperatorApproval: boolean;
}

export interface RepairDeps {
  db: DB;
  sseBroadcaster: SSEBroadcaster;
  costTracker: CostTracker;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const CODE_ERROR_PATTERNS = [
  /tsc\b/i,
  /TypeError/,
  /SyntaxError/,
  /Cannot find module/i,
  /ERR_MODULE_NOT_FOUND/,
  /Cannot resolve/i,
  /test.*fail/i,
  /assertion.*error/i,
  /AssertionError/i,
  /expect\(/i,
  /build.*fail/i,
  /compile.*error/i,
  /TS\d{4}/,  // TypeScript error codes like TS2345
];

const TRANSIENT_ERROR_PATTERNS = [
  /rate.limit/i,
  /timeout/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /overloaded/i,
  /503/,
  /502/,
  /429/,
  /spawn.*ENOENT/i,
];

function hasCodeLevelErrors(errors: string[]): boolean {
  const combined = errors.join('\n');
  return CODE_ERROR_PATTERNS.some((p) => p.test(combined));
}

function allTransient(errors: string[]): boolean {
  return errors.every((err) => TRANSIENT_ERROR_PATTERNS.some((p) => p.test(err)));
}

// ---------------------------------------------------------------------------
// System-wide repair lock
// ---------------------------------------------------------------------------

let repairInProgress = false;

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function getGitDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--stat', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return '';
  }
}

async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-only', 'HEAD'], { cwd });
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function getCommitHash(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function revertChanges(cwd: string): Promise<void> {
  try {
    await execFileAsync('git', ['checkout', '.'], { cwd });
  } catch {
    // Best effort
  }
}

// ---------------------------------------------------------------------------
// Spawn claude CLI for repair
// ---------------------------------------------------------------------------

interface ClaudeRepairResult {
  cost_usd?: number;
  result?: string;
}

async function spawnClaudeRepair(
  prompt: string,
  projectPath: string,
): Promise<ClaudeRepairResult> {
  const claudeBin = process.env['CLAUDE_BIN'] ?? '/Users/tomgibson/.local/bin/claude';

  return new Promise<ClaudeRepairResult>((resolve, reject) => {
    const child = spawn(
      claudeBin,
      [
        '-p', prompt,
        '--model', 'opus',
        '--output-format', 'json',
        '--max-turns', '20',
        '--dangerously-skip-permissions',
      ],
      {
        cwd: projectPath,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timeoutHandle = setTimeout(() => {
      if (!child.killed) {
        child.kill();
        reject(new Error('Self-repair claude CLI timed out after 5 minutes'));
      }
    }, 300_000);

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      let parsed: ClaudeRepairResult = {};
      try {
        parsed = JSON.parse(stdout) as ClaudeRepairResult;
      } catch {
        // Not JSON — use raw output as result
        parsed = { result: stdout.trim() || stderr.trim() };
      }
      if (code !== 0 && !parsed.result) {
        reject(new Error(`Self-repair CLI exited with code ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(parsed);
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Failed to spawn self-repair CLI: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Build repair prompt
// ---------------------------------------------------------------------------

function buildRepairPrompt(context: RepairContext): string {
  const errors = context.errorHistory.map((e, i) => `Error ${i + 1}:\n${e}`).join('\n\n');
  return `You are a self-repair agent. A task has failed ${context.errorHistory.length} times and requires automated diagnosis and repair.

## Task Context
- Title: ${context.taskTitle}
- Stage: ${context.taskStage}
- Description: ${context.taskDescription ?? '(none)'}
- Failed agents: ${context.failedAgents.join(', ')}

## Error History
${errors}

## Instructions
1. Diagnose the root cause of the failures.
2. If the errors indicate a code bug (type errors, import errors, test failures, build failures), fix the code directly.
3. If the errors are environmental (missing dependencies, wrong config), describe the fix in detail but do NOT modify code.
4. Focus only on the root cause — do not refactor unrelated code.
5. After making changes, verify the fix works by running the relevant build or test command.

Make minimal, targeted changes. Fix only what is broken.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function attemptSelfRepair(
  context: RepairContext,
  deps: RepairDeps,
): Promise<RepairResult> {
  // Gate 1: error classification
  if (!hasCodeLevelErrors(context.errorHistory) || allTransient(context.errorHistory)) {
    const diagnosis = 'All errors are transient/environmental — not a code issue';
    deps.sseBroadcaster.emit('self-repair-failed', {
      taskId: context.taskId,
      reason: diagnosis,
      timestamp: new Date().toISOString(),
    });
    return {
      success: false,
      diagnosis,
      filesChanged: [],
      commitHash: null,
      requiresOperatorApproval: false,
    };
  }

  // Gate 2: system-wide lock
  if (repairInProgress) {
    const diagnosis = 'Another repair is in progress';
    deps.sseBroadcaster.emit('self-repair-failed', {
      taskId: context.taskId,
      reason: diagnosis,
      timestamp: new Date().toISOString(),
    });
    return {
      success: false,
      diagnosis,
      filesChanged: [],
      commitHash: null,
      requiresOperatorApproval: false,
    };
  }

  repairInProgress = true;

  deps.sseBroadcaster.emit('self-repair-started', {
    taskId: context.taskId,
    errorCount: context.errorHistory.length,
    timestamp: new Date().toISOString(),
  });

  try {
    const prompt = buildRepairPrompt(context);

    // Spawn Claude to attempt the repair
    let claudeResult: ClaudeRepairResult;
    try {
      claudeResult = await spawnClaudeRepair(prompt, context.projectPath);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      deps.sseBroadcaster.emit('self-repair-failed', {
        taskId: context.taskId,
        reason,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        diagnosis: `Repair agent failed to run: ${reason}`,
        filesChanged: [],
        commitHash: null,
        requiresOperatorApproval: false,
      };
    }

    // Track cost if available
    if (claudeResult.cost_usd && claudeResult.cost_usd > 0) {
      deps.costTracker.trackCall({
        agentId: 'self-repair',
        taskId: context.taskId,
        model: 'claude-opus-4-20250514',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 0,
        status: 'success',
      }).catch(() => { /* best effort */ });
    }

    const diagnosis = claudeResult.result ?? 'Repair agent completed with no output';

    // --- agentic-dev self-repair: requires operator approval ---
    if (context.isAgenticDevProject) {
      const filesChanged = await getChangedFiles(context.projectPath);
      const diff = await getGitDiff(context.projectPath);

      // Revert immediately — operator must approve before applying
      await revertChanges(context.projectPath);

      deps.sseBroadcaster.emit('self-repair-completed', {
        taskId: context.taskId,
        success: true,
        requiresOperatorApproval: true,
        diagnosis,
        filesChanged,
        diff,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        diagnosis,
        filesChanged,
        commitHash: null,
        requiresOperatorApproval: true,
      };
    }

    // --- Target project repair: run verification ---
    let verificationPassed = false;
    let verificationError = '';

    // Try typecheck first, then test
    try {
      await execFileAsync('npm', ['run', 'typecheck'], {
        cwd: context.projectPath,
        timeout: 120_000,
      });
      verificationPassed = true;
    } catch (err) {
      // typecheck failed or not available — try test
      try {
        await execFileAsync('npm', ['test', '--', '--passWithNoTests'], {
          cwd: context.projectPath,
          timeout: 120_000,
        });
        verificationPassed = true;
      } catch (testErr) {
        verificationError = testErr instanceof Error ? testErr.message : String(testErr);
      }
    }

    if (!verificationPassed) {
      // Revert: the fix did not pass verification
      await revertChanges(context.projectPath);

      const failDiagnosis = `Repair attempted but verification failed: ${verificationError}. Original diagnosis: ${diagnosis}`;
      deps.sseBroadcaster.emit('self-repair-completed', {
        taskId: context.taskId,
        success: false,
        diagnosis: failDiagnosis,
        filesChanged: [],
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        diagnosis: failDiagnosis,
        filesChanged: [],
        commitHash: null,
        requiresOperatorApproval: false,
      };
    }

    // Verification passed — capture results
    const filesChanged = await getChangedFiles(context.projectPath);
    const commitHash = await getCommitHash(context.projectPath);

    deps.sseBroadcaster.emit('self-repair-completed', {
      taskId: context.taskId,
      success: true,
      requiresOperatorApproval: false,
      diagnosis,
      filesChanged,
      commitHash,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      diagnosis,
      filesChanged,
      commitHash,
      requiresOperatorApproval: false,
    };

  } finally {
    repairInProgress = false;
  }
}
