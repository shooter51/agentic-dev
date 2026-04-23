/**
 * Permission matrix for tool access by agent role.
 *
 * Each agent role is granted a specific set of tool names.  The
 * `isAllowed(agentId, toolName)` function is the single entry-point used by
 * the ToolExecutor before dispatching any tool call.
 *
 * Roles not listed here are denied all tool access by default.
 */

// ---------------------------------------------------------------------------
// Role → allowed tools map
// ---------------------------------------------------------------------------

/** Tools available to every agent regardless of role. */
const UNIVERSAL_TOOLS = [
  'read_file',
  'list_files',
  'search_files',
  'send_message',
  'signal_complete',
  'read_memories',
  'create_memory',
  'update_memory',
  'delete_memory',
];

const ROLE_TOOLS: Record<string, string[]> = {
  'Product Manager': [
    ...UNIVERSAL_TOOLS,
    'write_file',
    'beads_create',
    'beads_update',
    'beads_list',
  ],

  Architect: [
    ...UNIVERSAL_TOOLS,
    'write_file', // restricted to docs/ — enforced in WriteFileHandler
    'git_status',
    'git_branch',
    'beads_list',
  ],

  'Tech Lead': [
    ...UNIVERSAL_TOOLS,
    'run_command', // only test/lint categories — enforced in Sandbox.validateCommand
    'run_tests',
    'check_coverage',
    'git_status',
    'git_branch',
    'beads_update',
    'beads_list',
  ],

  'Developer (Senior)': [
    ...UNIVERSAL_TOOLS,
    'write_file',
    'run_command',
    'run_tests',
    'check_coverage',
    'git_status',
    'git_branch',
    'git_commit',
    'git_push',
    'create_pr',
    'beads_create',
    'beads_update',
    'beads_list',
  ],

  Developer: [
    ...UNIVERSAL_TOOLS,
    'write_file',
    'run_command',
    'run_tests',
    'check_coverage',
    'git_status',
    'git_branch',
    'git_commit',
    'git_push',
    'create_pr',
    'beads_create',
    'beads_update',
    'beads_list',
  ],

  'DevOps Engineer': [
    ...UNIVERSAL_TOOLS,
    'write_file',
    'run_command',
    'run_tests',
    'git_status',
    'git_branch',
    'git_commit',
    'git_push',
    'create_pr',
    'beads_update',
    'beads_list',
  ],

  'Manual QA': [
    ...UNIVERSAL_TOOLS,
    'run_command',
    'git_status',
    'beads_create',
    'beads_update',
    'beads_list',
  ],

  'QA Automation Engineer': [
    ...UNIVERSAL_TOOLS,
    'write_file',
    'run_command',
    'run_tests',
    'check_coverage',
    'git_status',
    'git_branch',
    'git_commit',
    'git_push',
    'create_pr',
    'beads_create',
    'beads_update',
    'beads_list',
  ],

  'Documentation Agent': [
    ...UNIVERSAL_TOOLS,
    'write_file',
    'run_command', // only docs category — enforced in Sandbox.validateCommand
    'beads_list',
  ],
};

// ---------------------------------------------------------------------------
// PermissionMatrix
// ---------------------------------------------------------------------------

export class PermissionMatrix {
  /**
   * Returns true when an agent with the given role (encoded as agentId prefix
   * in the current implementation, but passed by the executor as `agent.role`)
   * is allowed to invoke the named tool.
   *
   * The executor passes `agent.role` for the permission check; `agentId` is
   * kept in the signature for future per-agent overrides.
   */
  isAllowed(agentRole: string, toolName: string): boolean {
    const allowed = ROLE_TOOLS[agentRole];
    if (!allowed) return false;
    return allowed.includes(toolName);
  }

  /** Returns the full list of tools permitted for a given role. */
  allowedTools(agentRole: string): string[] {
    return ROLE_TOOLS[agentRole] ?? [];
  }
}

/** Convenience function — used in tests and tool-definitions. */
export function isAllowed(agentRole: string, toolName: string): boolean {
  return (ROLE_TOOLS[agentRole] ?? []).includes(toolName);
}

export { ROLE_TOOLS };
