import * as path from 'path';
import type { ProjectConfig } from '@agentic-dev/shared';

// ---------------------------------------------------------------------------
// Sensitive file patterns — can be overridden per-project via project.config
// ---------------------------------------------------------------------------

const DEFAULT_SENSITIVE_PATTERNS: RegExp[] = [
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

const READABLE_EXCEPTIONS: RegExp[] = [
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

// ---------------------------------------------------------------------------
// Command denylist
// ---------------------------------------------------------------------------

const DENIED_COMMANDS: RegExp[] = [
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

// ---------------------------------------------------------------------------
// Command categories
// ---------------------------------------------------------------------------

export const COMMAND_CATEGORIES: Record<string, RegExp[]> = {
  build: [/^npm\s+(run\s+)?build/, /^npx\s/, /^go\s+build/, /^swift\s+build/, /^tsc/],
  test: [/^npm\s+(run\s+)?test/, /^npx\s+(vitest|jest|playwright)/, /^go\s+test/, /^pytest/],
  lint: [/^npx\s+(eslint|prettier|biome)/, /^npm\s+run\s+lint/],
  git: [/^git\s+(status|diff|log|show|branch|stash)/],
  package: [/^npm\s+(install|ci|update)/, /^go\s+mod/, /^pip\s+install/],
  docs: [/^npx\s+(typedoc|mkdocs)/, /^npm\s+run\s+docs/],
};

// Flags that enable auto-modification of files — stripped from lint commands
// when run by the Tech Lead agent (review-only role).
const AUTOFIX_FLAGS = ['--fix', '--write', '-w', '--fix-type'];

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

// ---------------------------------------------------------------------------
// ToolConfig (local import avoidance — also available from @agentic-dev/shared)
// ---------------------------------------------------------------------------

import type { ToolConfig } from '@agentic-dev/shared';

// ---------------------------------------------------------------------------
// Sandbox class
// ---------------------------------------------------------------------------

export class Sandbox {
  constructor(private config: ToolConfig) {}

  /**
   * Ensures filePath does not escape repoPath via path traversal.
   * repoPath MUST be an absolute path — throws SandboxError otherwise.
   */
  validatePath(filePath: string, repoPath: string): void {
    if (!path.isAbsolute(repoPath)) {
      throw new SandboxError(`repoPath must be absolute, got: ${repoPath}`);
    }
    const resolved = path.resolve(repoPath, filePath);
    if (!resolved.startsWith(repoPath + path.sep) && resolved !== repoPath) {
      throw new SandboxError(`Path traversal attempt: ${filePath}`);
    }
  }

  /**
   * Returns true when the file should be treated as sensitive and denied for
   * read/write.  Accepts an optional ProjectConfig to allow per-project
   * overrides of the default pattern list.
   */
  isSensitiveFile(filePath: string, projectConfig?: ProjectConfig): boolean {
    const basename = path.basename(filePath);
    if (READABLE_EXCEPTIONS.some(p => p.test(basename))) return false;
    const patterns = getSensitivePatterns(projectConfig);
    return patterns.some(p => p.test(basename));
  }

  /**
   * Validates a command string against the denylist and per-role category
   * restrictions.  Returns the (possibly modified) command string to execute.
   *
   * - Denied commands throw SandboxError unconditionally.
   * - Unknown categories throw SandboxError so operators must explicitly allow
   *   new command patterns.
   * - Tech Lead: only test and lint categories; autofix flags stripped from
   *   lint commands (review-only).
   * - Documentation Agent: only docs category.
   */
  validateCommand(command: string, agentRole: string): string {
    // 1. Check denylist
    for (const pattern of DENIED_COMMANDS) {
      if (pattern.test(command)) {
        throw new SandboxError(`Denied command: ${command}`);
      }
    }

    // 2. Categorize
    const category = this.categorizeCommand(command);
    if (!category) {
      throw new SandboxError(
        `Unknown command category: ${command}. Add to command categories or contact operator.`,
      );
    }

    // 3. Role-based category restrictions
    if (agentRole === 'Tech Lead') {
      if (!['test', 'lint'].includes(category)) {
        throw new SandboxError(
          `Tech Lead can only run test and lint commands, not ${category}`,
        );
      }
      if (category === 'lint') {
        return this.stripAutofixFlags(command);
      }
    }

    if (agentRole === 'Documentation Agent' && category !== 'docs') {
      throw new SandboxError(
        `Documentation Agent can only run docs commands, not ${category}`,
      );
    }

    return command;
  }

  /** Returns the category name for a command, or null if uncategorised. */
  categorizeCommand(command: string): string | null {
    for (const [category, patterns] of Object.entries(COMMAND_CATEGORIES)) {
      if (patterns.some(p => p.test(command))) return category;
    }
    return null;
  }

  /** Strips autofix flags from a lint command string. */
  private stripAutofixFlags(command: string): string {
    const parts = command.split(/\s+/);
    return parts.filter(p => !AUTOFIX_FLAGS.includes(p)).join(' ');
  }
}
