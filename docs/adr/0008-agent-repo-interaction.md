# ADR-0008: Agent-to-Repo Interaction — SDK Tool Use with Sandboxed Execution

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

Developer, DevOps, QA, and Documentation agents need to interact with target project repositories — reading files, writing code, running tests, executing git commands, and running build tools. We need to decide how agents perform these actions.

## Decision

Use the **Anthropic SDK's tool use feature** with a **sandboxed execution layer** in the orchestrator.

### Tool Definitions

Define tools in the `tools` parameter of each `messages.create()` call:

| Tool | Description | Used By |
|------|-------------|---------|
| `read_file` | Read a file from the target repo | All agents |
| `write_file` | Write/create a file in the target repo | Dev, Arch, Automation, Doc, DevOps |
| `list_files` | List files matching a glob pattern | All agents |
| `search_files` | Search file contents (grep) | All agents |
| `run_command` | Execute a shell command in the target repo | Dev, DevOps, Automation, Tech Lead, Doc |
| `git_status` | Show git status | All agents |
| `git_branch` | Create/switch branches | Dev, DevOps |
| `git_commit` | Stage and commit changes | Dev, Arch, Automation, Doc |
| `git_push` | Push to remote | DevOps |
| `create_pr` | Create a GitHub PR via `gh` | DevOps |
| `run_tests` | Run test suite and return results | Dev, Tech Lead, QA, Automation |
| `check_coverage` | Run coverage report | Dev, Tech Lead, Automation |
| `beads_create` | Create a Beads issue | QA, Automation |
| `beads_update` | Update a Beads issue | All agents |
| `beads_list` | List Beads issues | All agents |
| `create_memory` | Create a memory in the agent's namespace | All agents |
| `read_memories` | Read own + shared project memories | All agents |
| `update_memory` | Update a memory in the agent's namespace | All agents |
| `delete_memory` | Delete a memory in the agent's namespace | All agents |

### Execution Layer

When the Anthropic API returns a `tool_use` block, the orchestrator's execution layer:

1. **Validates** the tool call — checks paths are within the target repo, commands are allowed, agent has permission for this tool.
2. **Executes** via Node.js `child_process.execFile()` or filesystem APIs.
3. **Returns** the result to the next API call as a `tool_result`.

### Security Constraints

- **Path validation:** All file operations are scoped to the target repo's directory. Path traversal attempts are rejected.
- **Command denylist + categorization:** Rather than a fragile allowlist, `run_command` uses a **denylist of dangerous commands** (rm -rf, git push --force, git reset --hard, DROP TABLE, shutdown, reboot, etc.) combined with **category-based approval**. Commands are categorized as: `build` (npm, go build, swift build), `test` (vitest, jest, pytest, go test), `lint` (eslint, prettier), `git` (git status, git diff), `package` (npm install, go mod tidy), `docs` (typedoc, mkdocs). Unknown commands are logged and blocked until the operator adds them to a category.
- **Command timeout:** Every `run_command` execution has a configurable timeout (default: 120 seconds, max: 600 seconds). Commands exceeding the timeout are killed via SIGTERM, then SIGKILL after 5 seconds.
- **Agent permissions:** Each agent role has a defined set of allowed tools. A QA agent cannot `git_push`. A Product Manager cannot `write_file`.
- **Sensitive file protection:** Files matching these patterns cannot be read or written: `.env` (but `.env.example` IS readable), `*credentials*`, `*.pem`, `*.key`, `*secret*`, `*.pfx`. The denylist is configurable per project.

### Tool Permission Matrix

| Tool | PM | Arch | Dev | Tech Lead | DevOps | QA | Automation | Doc |
|------|----|----|-----|-----------|--------|----|----|-----|
| read_file | Y | Y | Y | Y | Y | Y | Y | Y |
| write_file | N | Y* | Y | N | Y | N | Y | Y |
| list_files | Y | Y | Y | Y | Y | Y | Y | Y |
| search_files | Y | Y | Y | Y | Y | Y | Y | Y |
| run_command | N | N | Y | Y** | Y | N | Y | Y*** |
| git_status | Y | Y | Y | Y | Y | Y | Y | Y |
| git_branch | N | N | Y | N | Y | N | N | N |
| git_commit | N | Y* | Y | N | Y | N | Y | Y |
| git_push | N | N | N | N | Y | N | N | N |
| create_pr | N | N | N | N | Y | N | N | N |
| run_tests | N | N | Y | Y | N | Y | Y | N |
| check_coverage | N | N | Y | Y | N | N | Y | N |
| beads_create | N | N | N | N | N | Y | Y | N |
| beads_update | Y | Y | Y | Y | Y | Y | Y | Y |
| beads_list | Y | Y | Y | Y | Y | Y | Y | Y |
| create_memory | Y | Y | Y | Y | Y | Y | Y | Y |
| read_memories | Y | Y | Y | Y | Y | Y | Y | Y |
| update_memory | Y | Y | Y | Y | Y | Y | Y | Y |
| delete_memory | Y | Y | Y | Y | Y | Y | Y | Y |

**Notes:**
- `*` Architect can write ADR/LLD files to `docs/` directories only, and commit them.
- `**` Tech Lead can run `test` and `lint` category commands only, in **check-only mode** (e.g., `eslint` without `--fix`, `prettier --check`). Auto-fix flags are stripped by the execution layer to prevent implicit file writes.
- `***` Doc agent can run `docs` category commands only (doc build tools like typedoc, mkdocs).

## Alternatives Considered

1. **Direct shell access** — Let agents run arbitrary commands via the SDK. Rejected — too risky. Agents could delete files, run destructive git operations, or access secrets.

2. **Separate execution service** — A microservice that agents call via HTTP to perform repo operations. Rejected — adds unnecessary complexity for a single-process system.

3. **Agent spawns its own subprocess** — Each agent manages its own shell. Rejected — breaks the central orchestrator pattern and makes it impossible to enforce permissions.

## Consequences

- **Positive:** Full control over what agents can do. Every action is logged. Permissions enforced per role. Agents focus on decision-making; execution is deterministic.
- **Negative:** Must maintain tool definitions and the execution layer. Adding new tools requires code changes.
- **Risk:** Tool definitions may not cover all actions an agent needs. Mitigated by logging tool requests that fail validation — if agents consistently request unsupported actions, add new tools.
