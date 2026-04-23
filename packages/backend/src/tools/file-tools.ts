import * as fs from 'fs/promises';
import { Dirent } from 'fs';
import * as path from 'path';
import type { ToolHandler, ToolContext } from '@agentic-dev/shared';
import { Sandbox, SandboxError } from './sandbox';

// ---------------------------------------------------------------------------
// ReadFileHandler
// ---------------------------------------------------------------------------

export class ReadFileHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<string> {
    const filePath = input['path'] as string;
    this.sandbox.validatePath(filePath, ctx.repoPath);

    if (this.sandbox.isSensitiveFile(filePath)) {
      throw new SandboxError(`Cannot read sensitive file: ${filePath}`);
    }

    const fullPath = path.join(ctx.repoPath, filePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (content.length > 100_000) {
      return content.slice(0, 100_000) + '\n\n[Truncated — file exceeds 100K characters]';
    }

    return content;
  }
}

// ---------------------------------------------------------------------------
// WriteFileHandler
// ---------------------------------------------------------------------------

export class WriteFileHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<string> {
    const filePath = input['path'] as string;
    const content = input['content'] as string;

    this.sandbox.validatePath(filePath, ctx.repoPath);

    if (this.sandbox.isSensitiveFile(filePath)) {
      throw new SandboxError(`Cannot write sensitive file: ${filePath}`);
    }

    // Architect role: restrict writes to docs/ directories only.
    if (ctx.agentRole === 'Architect') {
      if (!filePath.startsWith('docs/')) {
        throw new SandboxError('Architect can only write to docs/ directories');
      }
    }

    const fullPath = path.join(ctx.repoPath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return `File written: ${filePath}`;
  }
}

// ---------------------------------------------------------------------------
// ListFilesHandler
// ---------------------------------------------------------------------------

export class ListFilesHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<string> {
    const dirPath = (input['path'] as string | undefined) ?? '.';
    this.sandbox.validatePath(dirPath, ctx.repoPath);

    const fullPath = path.join(ctx.repoPath, dirPath);

    let entries: Dirent[];
    try {
      entries = await fs.readdir(fullPath, { withFileTypes: true });
    } catch {
      throw new Error(`Cannot list directory: ${dirPath}`);
    }

    if (entries.length === 0) return '(empty directory)';

    return entries
      .map(e => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join('\n');
  }
}

// ---------------------------------------------------------------------------
// SearchFilesHandler
// ---------------------------------------------------------------------------

export class SearchFilesHandler implements ToolHandler {
  constructor(private sandbox: Sandbox) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<string> {
    const pattern = input['pattern'] as string;
    const searchDir = (input['path'] as string | undefined) ?? '.';
    this.sandbox.validatePath(searchDir, ctx.repoPath);

    const fullSearchDir = path.join(ctx.repoPath, searchDir);
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      return `Invalid regex pattern: ${pattern}`;
    }
    // Guard against catastrophic backtracking — reject patterns with nested quantifiers
    if (/(\+|\*|\{)\S*(\+|\*|\{)/.test(pattern)) {
      return `Pattern rejected: nested quantifiers may cause excessive backtracking`;
    }
    const results: string[] = [];

    await this.searchRecursive(fullSearchDir, ctx.repoPath, regex, results);

    if (results.length === 0) {
      return `No files matching pattern: ${pattern}`;
    }

    return results.join('\n');
  }

  private async searchRecursive(
    dir: string,
    repoPath: string,
    pattern: RegExp,
    results: string[],
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip hidden directories like .git, node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(repoPath, fullPath);

      if (entry.isDirectory()) {
        await this.searchRecursive(fullPath, repoPath, pattern, results);
      } else if (pattern.test(entry.name) || pattern.test(relativePath)) {
        results.push(relativePath);
      } else {
        // Also search file contents
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (pattern.test(content)) {
            results.push(relativePath);
          }
        } catch {
          // Binary or unreadable file — skip
        }
      }

      if (results.length >= 200) return;
    }
  }
}
