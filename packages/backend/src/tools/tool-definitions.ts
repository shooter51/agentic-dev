import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type { AgentIdentity } from '@agentic-dev/shared';

// ---------------------------------------------------------------------------
// All tool definitions — Anthropic API schema format
// ---------------------------------------------------------------------------

const ALL_TOOL_DEFINITIONS: Record<string, Tool> = {
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file from the project repository. Returns the file text, truncated at 100K characters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root (e.g. "src/index.ts")',
        },
      },
      required: ['path'],
    },
  },

  write_file: {
    name: 'write_file',
    description: 'Write content to a file in the project repository. Creates intermediate directories as needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from the project root',
        },
        content: {
          type: 'string',
          description: 'Full file content to write',
        },
      },
      required: ['path', 'content'],
    },
  },

  list_files: {
    name: 'list_files',
    description: 'List the files and subdirectories in a directory within the project repository.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative directory path from the project root. Defaults to "." (project root).',
        },
      },
      required: [],
    },
  },

  search_files: {
    name: 'search_files',
    description: 'Search for files by name pattern or content pattern within the project repository.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for in file names or file contents',
        },
        path: {
          type: 'string',
          description: 'Directory to search within (relative to project root). Defaults to ".".',
        },
      },
      required: ['pattern'],
    },
  },

  run_command: {
    name: 'run_command',
    description: 'Execute a shell command in the project directory. Commands are categorized and role-restricted. Output is truncated at 50K characters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g. "npm run build", "npx tsc --noEmit")',
        },
      },
      required: ['command'],
    },
  },

  run_tests: {
    name: 'run_tests',
    description: 'Run the project test suite and parse results into task metadata. Test pass/fail status and coverage are recorded for pipeline quality gates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'Optional custom test command. Defaults to "npm test -- --coverage --json".',
        },
      },
      required: [],
    },
  },

  check_coverage: {
    name: 'check_coverage',
    description: 'Run coverage for a specific test type and record the result in task metadata for pipeline quality gate evaluation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['unit', 'integration', 'e2e_api', 'e2e_ui'],
          description: 'The type of coverage to check',
        },
      },
      required: ['type'],
    },
  },

  git_status: {
    name: 'git_status',
    description: 'Show the working tree status of the project repository (short format).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  git_branch: {
    name: 'git_branch',
    description: 'List branches or create/switch to a branch in the project repository.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Branch name to create or switch to. Omit to list all branches.',
        },
        create: {
          type: 'boolean',
          description: 'When true and name is provided, creates a new branch (git checkout -b).',
        },
      },
      required: [],
    },
  },

  git_commit: {
    name: 'git_commit',
    description: 'Stage all changes and create a git commit with the given message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Commit message',
        },
      },
      required: ['message'],
    },
  },

  git_push: {
    name: 'git_push',
    description: 'Push the current branch to the remote repository.',
    input_schema: {
      type: 'object' as const,
      properties: {
        remote: {
          type: 'string',
          description: 'Remote name. Defaults to "origin".',
        },
        branch: {
          type: 'string',
          description: 'Branch name to push. Defaults to the current branch.',
        },
      },
      required: [],
    },
  },

  create_pr: {
    name: 'create_pr',
    description: 'Create a GitHub pull request for the current branch using the gh CLI.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Pull request title',
        },
        body: {
          type: 'string',
          description: 'Pull request description/body in Markdown',
        },
        base: {
          type: 'string',
          description: 'Base branch to merge into. Defaults to "main".',
        },
      },
      required: ['title'],
    },
  },

  send_message: {
    name: 'send_message',
    description: 'Send a blocking message to another agent and wait for their response. Used for clarifications and rejections.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Agent ID to send the message to',
        },
        content: {
          type: 'string',
          description: 'Message content',
        },
        type: {
          type: 'string',
          enum: ['clarification', 'rejection'],
          description: 'Message type. Defaults to "clarification".',
        },
      },
      required: ['to', 'content'],
    },
  },

  signal_complete: {
    name: 'signal_complete',
    description: 'Signal that you have completed your work on this task. Stops the agent loop and triggers the next pipeline stage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of the work completed',
        },
        handoff_content: {
          type: 'string',
          description: 'Handoff document content for the next agent in the pipeline',
        },
      },
      required: ['summary', 'handoff_content'],
    },
  },

  beads_create: {
    name: 'beads_create',
    description: 'Create a new item (issue, task, bug) in the Beads project tracking system.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Item title',
        },
        description: {
          type: 'string',
          description: 'Item description',
        },
        type: {
          type: 'string',
          enum: ['feature', 'bug', 'task', 'chore'],
          description: 'Item type. Defaults to "task".',
        },
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3', 'P4'],
          description: 'Item priority. Defaults to "P2".',
        },
        assignee: {
          type: 'string',
          description: 'Agent ID to assign the item to',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to attach to the item',
        },
      },
      required: ['title'],
    },
  },

  beads_update: {
    name: 'beads_update',
    description: 'Update an existing item in the Beads project tracking system.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Beads item ID (e.g. "BEADS-42")',
        },
        title: {
          type: 'string',
          description: 'New title',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'done', 'cancelled'],
          description: 'New status',
        },
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3', 'P4'],
          description: 'New priority',
        },
        assignee: {
          type: 'string',
          description: 'New assignee agent ID',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'New labels (replaces existing)',
        },
      },
      required: ['id'],
    },
  },

  beads_list: {
    name: 'beads_list',
    description: 'List items from the Beads project tracking system, with optional filtering.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'done', 'cancelled'],
          description: 'Filter by status',
        },
        type: {
          type: 'string',
          enum: ['feature', 'bug', 'task', 'chore'],
          description: 'Filter by item type',
        },
      },
      required: [],
    },
  },

  create_memory: {
    name: 'create_memory',
    description: 'Create a new memory entry to persist important information across task sessions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the memory',
        },
        content: {
          type: 'string',
          description: 'Memory content',
        },
        type: {
          type: 'string',
          enum: ['project', 'pattern', 'decision', 'teammate', 'feedback'],
          description: 'Memory type',
        },
        project_id: {
          type: 'string',
          description: 'Project ID to scope this memory to (optional; omit for agent-global memories)',
        },
      },
      required: ['title', 'content', 'type'],
    },
  },

  read_memories: {
    name: 'read_memories',
    description: 'Retrieve your memories, optionally scoped to a project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: {
          type: 'string',
          description: 'Project ID to filter memories by (optional)',
        },
      },
      required: [],
    },
  },

  update_memory: {
    name: 'update_memory',
    description: 'Update an existing memory entry.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to update',
        },
        title: {
          type: 'string',
          description: 'New title',
        },
        content: {
          type: 'string',
          description: 'New content',
        },
        type: {
          type: 'string',
          enum: ['project', 'pattern', 'decision', 'teammate', 'feedback'],
          description: 'New type',
        },
      },
      required: ['memory_id'],
    },
  },

  delete_memory: {
    name: 'delete_memory',
    description: 'Delete a memory entry.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_id: {
          type: 'string',
          description: 'ID of the memory to delete',
        },
      },
      required: ['memory_id'],
    },
  },
};

// ---------------------------------------------------------------------------
// getToolsForAgent
// ---------------------------------------------------------------------------

/**
 * Returns the Anthropic Tool schema objects for all tools the given agent is
 * permitted to use (as declared in their `allowedTools` list).
 *
 * Any tool name in `allowedTools` that doesn't have a definition here is
 * silently skipped (to allow future tools to be added incrementally).
 */
export function getToolsForAgent(agent: AgentIdentity): Tool[] {
  return agent.allowedTools
    .map(name => ALL_TOOL_DEFINITIONS[name])
    .filter((t): t is Tool => t !== undefined);
}

export { ALL_TOOL_DEFINITIONS };
