import { spawn } from 'child_process';
import type { ToolHandler, ToolContext } from '@agentic-dev/shared';
import type { Sandbox } from './sandbox';

// ---------------------------------------------------------------------------
// Internal helper: run a git command in repoPath
// ---------------------------------------------------------------------------

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args[0]} failed (exit ${code}): ${stderr || stdout}`));
        return;
      }
      resolve(stdout.trim() || '(no output)');
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// GitStatusHandler
// ---------------------------------------------------------------------------

export class GitStatusHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    return runGit(['status', '--short'], ctx.repoPath);
  }
}

// ---------------------------------------------------------------------------
// GitBranchHandler
// ---------------------------------------------------------------------------

export class GitBranchHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const branchName = input['name'] as string | undefined;
    const create = input['create'] as boolean | undefined;

    if (branchName && create) {
      return runGit(['checkout', '-b', branchName], ctx.repoPath);
    } else if (branchName) {
      return runGit(['checkout', branchName], ctx.repoPath);
    }
    // List branches
    return runGit(['branch', '--list'], ctx.repoPath);
  }
}

// ---------------------------------------------------------------------------
// GitCommitHandler
// ---------------------------------------------------------------------------

export class GitCommitHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const message = input['message'] as string;

    if (!message) {
      throw new Error('Commit message is required');
    }

    // Stage tracked/modified files only (not untracked) to avoid staging .env or secrets
    await runGit(['add', '-u'], ctx.repoPath);
    return runGit(['commit', '-m', message], ctx.repoPath);
  }
}

// ---------------------------------------------------------------------------
// GitPushHandler
// ---------------------------------------------------------------------------

export class GitPushHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const remote = (input['remote'] as string | undefined) ?? 'origin';
    // Determine current branch if not provided
    const branch = (input['branch'] as string | undefined)
      ?? (await runGit(['branch', '--show-current'], ctx.repoPath));

    return runGit(['push', remote, branch, '--set-upstream'], ctx.repoPath);
  }
}

// ---------------------------------------------------------------------------
// CreatePrHandler
// ---------------------------------------------------------------------------

export class CreatePrHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const title = input['title'] as string;
    const body = (input['body'] as string | undefined) ?? '';
    const base = (input['base'] as string | undefined) ?? 'main';

    if (!title) {
      throw new Error('PR title is required');
    }

    // Use gh CLI to create PR
    return new Promise((resolve, reject) => {
      const args = ['pr', 'create', '--title', title, '--base', base];
      if (body) {
        args.push('--body', body);
      } else {
        args.push('--body', '');
      }

      const child = spawn('gh', args, {
        cwd: ctx.repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`gh pr create failed (exit ${code}): ${stderr || stdout}`));
          return;
        }
        resolve(stdout.trim());
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn gh: ${err.message}`));
      });
    });
  }
}
