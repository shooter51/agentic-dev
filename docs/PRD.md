# Product Requirements Document: Agentic Dev

**Version:** 1.0
**Date:** 2026-04-22
**Author:** Product Spec (Human-directed)
**Status:** Draft — Awaiting Approval

---

## 1. Vision

Agentic Dev is a multi-agent software development system powered by the Anthropic SDK. It orchestrates a team of specialized AI agents — each with a distinct role, persistent memory, and defined lane — to take a task from idea through production deployment. The system enforces a structured pipeline with quality gates, handoff protocols, and full traceability. A web-based Kanban UI gives the human operator real-time visibility into task progress across all stages.

---

## 2. Goals

1. **Structured autonomy** — Agents work independently within their lane, passing structured handoffs between stages.
2. **Quality enforcement** — No task advances without meeting defined quality gates (100% Pact coverage, 98% unit coverage, security review, peer review).
3. **Full traceability** — Every decision, handoff, and communication is logged and queryable.
4. **Real code output** — Development and Automation agents write production code in real Git repos, create branches, run tests, and open PRs.
5. **Human oversight** — The operator sees everything on a Kanban board and can intervene, reprioritize, or block at any stage.

---

## 3. Agent Roles

### 3.1 Product Manager (1)

**Lane:** Product
**Responsibilities:**
- Receives raw task descriptions from the operator
- Writes formal Product Requirement Documents (PRDs) for each task
- Defines acceptance criteria
- Prioritizes the backlog
- Answers clarifying questions from downstream agents
- Reviews deliverables against original requirements before deployment

**PRD Template (mandatory for every task):**

```markdown
# PRD: [Task ID] — [Title]

## 1. Problem Statement
[What problem does this solve? Why does it matter?]

## 2. User Stories
- As a [role], I want [capability] so that [benefit]

## 3. Functional Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | [requirement] | Must Have / Should Have / Nice to Have |

## 4. Non-Functional Requirements
[Performance, security, scalability, accessibility requirements]

## 5. Acceptance Criteria
| ID | Criteria | Verification Method |
|----|----------|-------------------|
| AC-001 | [testable condition] | [how to verify] |

## 6. Dependencies
[External services, APIs, other tasks that must complete first]

## 7. Out of Scope
[Explicitly state what this task does NOT include]

## 8. UI/UX Requirements
[Wireframes, user flows, design references — if applicable]

## 9. Data Requirements
[Data models, migrations, data sources — if applicable]

## 10. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
```

**Outputs:**
- PRD (using template above) with acceptance criteria
- Handoff to Architect

### 3.2 Architect (1)

**Lane:** Architecture
**Responsibilities:**
- Reads PRD from Product Manager
- Explores the target codebase to understand current state
- Writes Architecture Decision Records (ADRs) for significant decisions
- Produces Low-Level Design documents (LLDs) with:
  - File-level changes (what files to create, modify, delete)
  - Interface definitions
  - Data model changes
  - Dependency additions
- Assigns tasks to specific Developers based on specialization and workload
- Defines the folder structure expectations for the task
- Answers clarifying questions from Developers
- **Maintains living architectural documentation throughout the entire development cycle:**
  - Updates ADRs when decisions change or new decisions are made
  - Updates LLDs when implementation deviates from original design (with justification)
  - Maintains an `ARCHITECTURE.md` for each target project documenting current system architecture
  - Maintains a `DESIGN_DECISIONS.md` for each target project capturing rationale behind key choices
  - Reviews all handoffs from Development, DevOps, and QA stages for architectural impact
  - If any stage introduces changes that affect the architecture, the Architect updates documentation before the task advances
- Documentation is never "done" — it reflects the current state of the system at all times

**Outputs:**
- ADR(s) — created and updated throughout the lifecycle
- LLD with file-level implementation plan — updated if implementation changes
- `ARCHITECTURE.md` — kept current after every task
- `DESIGN_DECISIONS.md` — kept current after every task
- Developer assignment
- Handoff to assigned Developer(s)

### 3.3 Developers (3)

**Lane:** Development
**Responsibilities:**
- Read LLD from Architect
- Implement exactly what is specified — no more, no less
- Fully implement everything — no stubs, no TODOs, no placeholder logic, no "not implemented" throws
- Write unit tests alongside code (minimum 98% coverage on new/modified code)
- Write Pact contract tests (100% coverage for all service boundaries)
- Create feature branches, commit code, push to remote
- Request clarification from Architect when the LLD is ambiguous
- Each Developer can specialize in domains (frontend, backend, infra, mobile, etc.)
- **Dev-1 (Senior, Opus):** Handles complex/difficult tasks — ambiguous requirements, cross-cutting concerns, performance-critical code, novel algorithms
- **Dev-2 (Sonnet):** Standard implementation work
- **Dev-3 (Sonnet):** Standard implementation work
- **Parallel development:** The Architect can break a task into sub-tasks and assign them to multiple Developers simultaneously. Sub-tasks are worked in parallel on separate branches and converge back before handoff to DevOps.
- **Subagents:** All Developers are free to spin up subagents as needed for their work — research, code generation, file exploration, testing, etc. Subagents are ephemeral and scoped to the Developer's current task.

**Quality Gates (must pass before handoff):**
- All unit tests pass (mock data only — no real data in unit tests)
- Unit test coverage >= 98% on new/modified code
- All Pact contract tests pass (100% coverage, mock data only)
- No lint errors
- Code compiles/builds successfully
- Tech Lead peer review approved

**Outputs:**
- Working code on a feature branch
- Test results and coverage report
- Handoff to Tech Lead (peer review) → then DevOps (Build)

### 3.4 Tech Lead (1)

**Lane:** Spans Development → DevOps (Build) boundary
**Model:** Opus
**Responsibilities:**
- Performs peer review on all code before it advances to DevOps
- Performs security review (OWASP top 10, secrets, injection, insecure defaults)
- Reviews code for correctness, edge cases, logic errors
- Verifies code does exactly what the LLD specified — no more, no less
- Checks that unit test coverage meets threshold
- Flags any stubs, TODOs, or placeholder logic (auto-reject)
- Builds persistent memory of codebase patterns and past review findings
- Can request changes (blocking) — Developer must address before re-review
- Maintains knowledge of all Developers' strengths and past issues

**Quality Gates (must pass before DevOps):**
- Zero Critical/High security issues
- No stubs or incomplete implementations
- Code matches LLD specification
- Unit test coverage verified >= 98%
- All review comments addressed

**Outputs:**
- Review report (approved / changes requested)
- Security review report
- Handoff to DevOps (Build) on approval

### 3.5 DevOps Engineer (1)

**Lane:** DevOps (Build) and DevOps (Deploy)
**Responsibilities:**

*Build Phase:*
- Pulls the feature branch
- Runs the full build pipeline
- Validates folder structure against project conventions
- Ensures no secrets or credentials are committed
- Validates CI configuration
- Runs security scanning (dependency audit, SAST)
- Enforces folder structure rules (root stays clean, source in src/, tests in tests/, etc.)

*Deploy Phase (after QA):*
- Merges PR to main (only after all QA gates pass and operator approval)
- Runs deployment pipeline
- Validates deployment health
- Monitors for errors post-deploy

**Quality Gates (Build — must pass before QA):**
- Build succeeds
- Folder structure is clean
- No secrets detected
- Security scan passes
- All tests pass in CI environment

**Outputs:**
- Build report
- Folder structure audit
- Security scan results
- Handoff to Manual QA (after Build) or deployment confirmation (after Deploy)

### 3.6 Manual QA (1)

**Lane:** Manual QA
**Responsibilities:**
- Reads PRD and acceptance criteria
- Performs exploratory testing on the running application
- Tests edge cases, error states, and user flows not covered by acceptance criteria
- Documents defects with reproduction steps
- Defines test cases for the Automation Engineer — these become the automation spec
- Validates that acceptance criteria are met
- Can send tasks back to Development if defects are found (with defect details)
- Defects are automatically created as new tasks in the system and flow through the pipeline without operator intervention
- Defect tasks are auto-prioritized above feature work — they go to the front of the queue

**Defect Template (mandatory for every defect):**

```markdown
# Defect: [Defect ID] — [Title]

## Severity
[Critical / High / Medium / Low]

## Task Reference
[Task ID this defect was found in]

## Environment
[OS, browser, device, environment details]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Screenshots / Evidence
[Attach screenshots, logs, video if applicable]

## Acceptance Criteria Affected
[Which AC-xxx does this violate, if any]

## Notes
[Any additional context — intermittent? data-dependent? regression?]
```

**Quality Gates (must pass before Automation):**
- All acceptance criteria verified
- No Critical or High severity defects open
- Test case document produced for Automation

**Outputs:**
- Exploratory test report
- Defect list (if any)
- Test case specifications for Automation Engineer
- Handoff to Automation Engineer (or back to Development if defects found)

### 3.7 QA Automation Engineer (1)

**Lane:** Automation
**Responsibilities:**
- Reads test case specifications from Manual QA
- Implements automated integration tests using real data (no mocks, no seeds, no fixtures)
- Implements automated E2E API tests using real data
- Implements automated E2E UI tests using real data
- Tests must create their own data through the application's real APIs/flows — no pre-loaded seed data
- Ensures all test cases from Manual QA are automated
- Runs the full automated test suite
- Reports results and coverage

**Quality Gates (must pass before Deploy):**
- All Manual QA test cases have corresponding automated tests
- Integration test coverage >= 90% (real data — no mocks)
- E2E API test coverage >= 85% (real data — no mocks)
- E2E UI test coverage >= 85% (real data — no mocks)
- All automated tests pass
- No flaky tests (tests must pass 3 consecutive runs)

**Outputs:**
- Automated test code (committed to the repo)
- Test execution report
- Handoff to DevOps (Deploy)

### 3.8 Documentation Agent (1)

**Lane:** Spans all stages (triggered after Development, and again after Arch Review)
**Model:** Sonnet
**Responsibilities:**
- Creates and maintains the Markdown help articles that back the Help Widget's RAG system (`docs/help/`)
- Each article uses YAML frontmatter (`title`, `category`, `tags`, `order`) following the DiveStreams/GradeSnap pattern
- When a new feature is developed, writes user-facing help articles explaining how to use it
- When an existing feature is modified, updates the corresponding help articles to reflect changes
- Writes in a direct, user-friendly tone — numbered steps, tip callout blocks, no jargon
- Maintains the static guide section content (section pages for the guide route)
- Maintains the comprehensive users guide (`docs/features/users-guide.md`)
- Ensures navigation targets are updated when new pages or features are added
- Reviews PRDs and acceptance criteria to understand what the user needs to know
- Reviews the actual implemented code/UI to document what was actually built (not what was planned)
- Can request clarification from any agent about feature behavior

**Quality Gates (must pass before Done):**
- Every user-facing feature has a corresponding help article
- All modified features have updated help articles
- Articles have correct frontmatter (title, category, tags)
- Navigation targets are current — no dead links
- Users guide is updated to reflect the current state

**Outputs:**
- New/updated Markdown help articles in `docs/help/`
- Updated guide section content
- Updated users guide
- Updated navigation targets
- Handoff confirmation to Arch Review

---

## 4. Pipeline Stages & Kanban Columns

```
Todo → Product → Architecture → Development → Tech Lead Review → DevOps (Build) → Manual QA → Automation → Documentation → DevOps (Deploy) → Arch Review → Done
```

| Column | Owner | Entry Criteria | Exit Criteria |
|--------|-------|---------------|---------------|
| Todo | Operator | Task created | Operator prioritizes and moves to Product |
| Product | Product Manager | Task in backlog | PRD with acceptance criteria complete |
| Architecture | Architect | PRD approved | ADR(s) + LLD + Developer assignment complete |
| Development | Developer(s) | LLD received | Code complete, 98% unit coverage, 100% Pact, all tests pass |
| Tech Lead Review | Tech Lead | Code complete | Peer review approved, security review clean, no stubs |
| DevOps (Build) | DevOps | Tech Lead approved | Build passes, folder structure clean, security scan clean |
| Manual QA | Manual QA | Build verified | Acceptance criteria met, test cases written, no critical defects |
| Automation | Automation Eng. | Test cases received | All test cases automated, all pass 3x |
| Documentation | Documentation Agent | Automation complete | Help articles written/updated, guide current, nav targets current |
| DevOps (Deploy) | DevOps | Documentation complete | Deployed, health check passes, operator notified |
| Arch Review | Architect | Deployment complete | Architecture docs updated, ADRs current, ARCHITECTURE.md + DESIGN_DECISIONS.md reflect final state |
| Done | — | Arch Review complete | — |

### 4.2 Defect Flow (Automatic)

When Manual QA or the Automation Engineer discovers a defect:

1. A defect task is **automatically** created in the system using the Defect Template
2. The defect task is assigned **higher priority than all feature work** — it goes to the front of the queue
3. The defect flows through a shortened pipeline based on its nature:
   - **Code defect:** Architecture (Architect reviews scope) → Development → DevOps (Build) → Manual QA (re-verify) → Automation (add regression test) → DevOps (Deploy)
   - **Test defect:** Automation (fix the test) → Manual QA (re-verify)
4. No operator intervention is required — defects are picked up and worked automatically
5. The original parent task remains blocked at its current stage until all its defects are resolved
6. Defect tasks link back to the parent task for traceability

---

## 5. Handoff Protocol

### 5.1 Handoff Document

When an agent completes its stage, it creates a `handoff.md` stored in the database with:

```markdown
# Handoff: [Task ID] — [Stage] → [Next Stage]

## From
- Agent: [agent role and ID]
- Completed: [timestamp]

## Summary
[What was done in this stage]

## Deliverables
[List of artifacts produced — PRDs, ADRs, LLDs, code branches, test reports, etc.]

## Key Decisions
[Any significant decisions made and why]

## Open Questions
[Anything the next agent should be aware of or may need to clarify]

## Blockers
[Any known issues that could affect the next stage]

## References
[Links to files, branches, PRs, documents]
```

### 5.2 Receiving a Handoff

When an agent picks up a task, it must:

1. Read the project's `CLAUDE.md` to understand project conventions
2. Read the `handoff.md` from the previous stage
3. Read its own persistent memory for relevant context
4. If anything is unclear, send a clarification request to the previous agent (blocking)
5. Begin work only after all questions are resolved

### 5.3 Rejection / Send-Back

Any agent can reject a handoff and send a task back to the previous stage with:
- Reason for rejection
- Specific issues to address
- The task moves backward on the Kanban board

---

## 6. Communication System

### 6.1 Async Handoffs
- Structured `handoff.md` documents (described above)
- Stored in the database, linked to the task

### 6.2 Direct Messaging
- Any agent can send a message to any other agent
- Messages are blocking — the sender waits for a response
- All messages are logged and visible in the UI
- Message format:

```json
{
  "from": "architect",
  "to": "product-manager",
  "task_id": "TASK-001",
  "type": "clarification",
  "message": "The PRD mentions 'real-time updates' — does this require WebSocket or is polling acceptable?",
  "timestamp": "2026-04-22T10:30:00Z"
}
```

### 6.3 Message Types
- `clarification` — Asking a question (blocking, expects response)
- `notification` — Informational, no response needed
- `rejection` — Sending a task back with issues
- `status_update` — Progress update for the Kanban UI

---

## 7. Agent Memory System

### 7.1 Storage
- SQLite database
- Each agent has its own memory namespace (table partition or schema)
- Memories are persistent across tasks and sessions

### 7.2 Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `project` | Knowledge about a specific target project | "gradeSnap uses Drizzle ORM with Postgres" |
| `pattern` | Learned coding patterns and conventions | "This repo uses barrel exports in index.ts files" |
| `decision` | Past architectural or design decisions | "We chose SQLite over Postgres for the memory store" |
| `teammate` | Knowledge about other agents' specializations | "Dev-2 specializes in React frontend work" |
| `feedback` | Corrections or preferences from the operator | "Operator prefers smaller PRs over large ones" |

### 7.3 Memory Lifecycle
- Agents can create, read, update, and delete their own memories
- Agents can read (but not modify) shared project memories
- Stale memories should be updated when contradicted by current codebase state
- The operator can view and manage all agent memories through the UI

---

## 8. Tech Stack

### 8.1 Backend
- **Runtime:** Node.js with TypeScript
- **Framework:** Express or Fastify (TBD in Architecture)
- **Database:** SQLite (via better-sqlite3 or Drizzle ORM)
- **Agent SDK:** Anthropic TypeScript SDK (`@anthropic-ai/sdk`)
- **Task Queue:** In-process queue (Bull or custom) for agent task orchestration

### 8.2 Frontend
- **Framework:** React with TypeScript
- **Build Tool:** Vite
- **State Management:** TBD in Architecture
- **UI Components:** TBD in Architecture (lightweight — Tailwind + headless, or a component library)

### 8.3 Infrastructure
- Runs locally on the operator's machine
- SQLite file stored in the project directory
- No cloud dependencies for the system itself (target repos may deploy to cloud)

---

## 9. Kanban UI Requirements

### 9.1 Board View
- Columns matching pipeline stages: Todo, Product, Architecture, Development, Tech Lead Review, DevOps (Build), Manual QA, Automation, Documentation, DevOps (Deploy), Arch Review, Done
- Task cards showing:
  - Task ID and title
  - Assigned agent
  - Time in current stage
  - Priority indicator
  - Quick status (in progress, blocked, waiting for clarification)

### 9.2 Task Detail View
- Full task history (every stage transition, handoff, message)
- Current handoff document
- Agent messages and clarification threads
- Deliverables (links to PRDs, ADRs, LLDs, branches, PRs)
- Quality gate status (coverage numbers, test results, security scan)

### 9.3 Agent Communication Feed
- **Real-time feed of all inter-agent messages** — every clarification question, response, notification, rejection, and status update
- Messages displayed in a threaded chat-style view grouped by task
- Each message shows: from agent, to agent, timestamp, message type (clarification/notification/rejection), and full content
- Clarification threads are collapsible — show the question, the blocking state, and the response when it arrives
- Filter by: task, agent, message type, date range
- Search across all agent communications
- Operator can inject messages into any thread (as the human operator)
- Unresolved clarifications are highlighted — easy to spot if an agent is stuck waiting

### 9.4 Agent Panel
- List of all agents with current status (idle, working, waiting for clarification)
- Agent memory viewer
- Ability to send a message to any agent as the operator
- Agent activity log
- If an agent is waiting on a clarification, show what it asked and who it's waiting on

### 9.5 Operator Controls
- Create new tasks
- Reprioritize the backlog
- Approve/reject stage transitions (optional — can be set to auto-advance)
- Force-move tasks between stages
- Pause/resume agents
- View and edit agent memories

### 9.6 Help Widget
Following the established pattern from DiveStreams and GradeSnap:
- **Floating circular "?" button** fixed at bottom-right corner of the UI
- Opens a **chat panel** (400px wide, 500px max-height) anchored above the button
- AI-powered help backed by RAG over the system's own documentation
- User messages in brand-color bubbles (right-aligned), assistant responses in muted bubbles (left-aligned)
- Assistant responses rendered as Markdown (bold, lists, code blocks, headings)
- Three-dot bounce animation while loading
- **"Take me there" navigation pills** — when the AI references a board view, task, agent, or setting, it embeds navigation hints that render as clickable buttons routing the user directly to that location in the UI
- Help articles stored as Markdown files with YAML frontmatter (`title`, `category`, `tags`)
- Keyword-scored article retrieval (title: +10, tags: +8, category: +5, body: +1 per hit, capped at 20)
- Top 3-5 articles fed as context to Claude
- Closes on Escape, Enter to send
- Available on every page of the UI

---

## 10. Defect Tracking — Beads (Required)

Beads (`bd` CLI) is the **only** defect and issue tracker for all target projects. No other tracking system (GitHub Issues, Jira, Linear, markdown TODOs) is to be used.

### 10.1 Beads Configuration
- Each target project must have Beads initialized (`.beads/` directory)
- Backend: Dolt database in server mode
- Dolt server runs locally via launchd (`launchctl start com.dolt.sql-server`)
- Database naming convention: `beads_<PROJECT_PREFIX>` (e.g., `beads_DS`, `beads_GS`)

### 10.2 Agent Integration with Beads
All agents must use Beads for issue tracking:

```bash
bd list                              # Check open issues before starting work
bd create "title" -t bug -p P1 \
  --body "description"               # Create a defect (QA agents)
bd update <ID> --status in_progress  # When an agent picks up work
bd close <ID> --reason "what was done" # When work is complete
bd dolt push                         # Push Beads state (part of session close)
```

### 10.3 Issue Types and Priorities
- **Types:** `bug`, `feature`, `task`, `chore`
- **Priorities:** P0 (critical), P1 (high), P2 (medium/default), P3 (low), P4 (nice-to-have)

### 10.4 Defect Auto-Flow with Beads
When Manual QA or Automation discovers a defect:
1. Agent creates a Beads issue using the Defect Template (`bd create -t bug -p <priority>`)
2. The system automatically creates a corresponding pipeline task linked to the Beads ID
3. The defect flows through the shortened pipeline (see Section 4.2)
4. When the fix is deployed, the agent closes the Beads issue (`bd close <ID>`)
5. `bd dolt push` is run to persist the state

### 10.5 Beads in the UI
- The Kanban board shows Beads issue IDs on task cards
- Task detail view links to the full Beads issue
- Defect counts are visible per task and per stage
- A dedicated "Defects" view shows all open Beads issues across all projects

---

## 11. Target Project Integration

### 10.1 Supported Stacks
- TypeScript / React frontends
- Node.js / TypeScript backends
- Go backends and CLI tools
- Swift / iOS applications
- AWS infrastructure (CDK, Terraform, CloudFormation)
- Cloudflare Workers / Pages

### 10.2 Project Onboarding
- Operator provides the path to the target repo
- System reads `CLAUDE.md`, `package.json`, `tsconfig.json`, etc. to understand the project
- Agents build project-specific memories during their first interaction
- Multiple target projects can be registered

### 10.3 Git Integration
- Agents create feature branches named: `agentic/<task-id>/<short-description>`
- Agents commit with structured messages
- PRs are created via GitHub CLI (`gh`)
- Merges require operator approval (enforced by the system)

---

## 12. Testing Rules — Non-Negotiable

These rules are absolute. No agent may override, relax, or work around them. A task is NOT done until every rule is satisfied.

### 11.1 No Stubs

- Every function, service, endpoint, and component must be fully implemented.
- Stub implementations (returning hardcoded values, `// TODO`, `throw new Error('not implemented')`, empty method bodies) are forbidden.
- If a dependency doesn't exist yet, build it. If it's out of scope, escalate to the Architect — do not stub it.
- Code review (peer review agent) must flag any stub and reject the PR.

### 11.2 No Mock Data Outside Unit Tests

- **Unit tests:** Mock data is permitted. This is the ONLY place mocks are allowed.
- **Integration tests:** Real data. No mocks, no stubs, no fakes, no in-memory replacements.
- **E2E API tests:** Real data. Hit real endpoints, real databases, real services.
- **E2E UI tests:** Real data. Real browser, real API, real database.
- **Pact contract tests:** Mock data permitted (contract tests are unit-level by nature).
- **Seeded data is NOT real data.** Tests must create their own data through the application's real APIs/flows, or use data that exists in the real environment. Pre-loaded fixtures and seed scripts are not acceptable for integration or E2E tests.

### 11.3 Coverage Thresholds — Hard Gates

No task advances past its stage if these thresholds are not met:

| Test Type | Threshold | Data Requirement | Enforced At |
|-----------|-----------|-----------------|-------------|
| Unit tests | >= 98% | Mock data allowed | Development |
| Pact contract tests | 100% | Mock data allowed | Development |
| Integration tests | >= 90% | Real data required | Automation |
| E2E API tests | >= 85% | Real data required | Automation |
| E2E UI tests | >= 85% | Real data required | Automation |

### 11.4 Definition of "Done"

A task is **not done** unless ALL of the following are true:
1. All code is fully implemented — zero stubs, zero TODOs, zero placeholder logic
2. All unit tests pass with >= 98% coverage (mocks allowed)
3. All Pact contract tests pass with 100% coverage
4. All integration tests pass with >= 90% coverage using real data
5. All E2E API tests pass with >= 85% coverage using real data
6. All E2E UI tests pass with >= 85% coverage using real data
7. All tests pass 3 consecutive runs (no flaky tests)
8. Security review passes with zero Critical/High issues
9. Peer review approved
10. Folder structure is clean
11. No secrets committed
12. `ARCHITECTURE.md` and `DESIGN_DECISIONS.md` are updated to reflect current state

**If any of these fail, the task goes back. No exceptions. No "we'll fix it later." No "it's good enough."**

---

## 13. Role-Specific Best Practices

Each agent must follow the approved best practices for its role. The full list of 151 approved practices is maintained in [`docs/recommended-practices.md`](recommended-practices.md), organized by role:

| Role | Practices | Key Areas |
|------|-----------|-----------|
| Developer | 37 | Code quality, git workflow, code review, testing, security, performance, error handling, API design, database, frontend |
| QA | 32 | Exploratory testing, test case design, defect management, automation patterns, E2E, API testing, security testing, performance, test data, reporting |
| Product Manager | 28 | Requirements, PRD standards, user stories, acceptance criteria, backlog, scope, decomposition, risk, metrics, edge cases, NFRs, traceability |
| Architecture | 30 | ADRs, LLD standards, system design, API design, data modeling, security, resilience, observability, code organization, migrations, diagramming |
| Documentation | 24 | User docs, API docs, writing style, docs-as-code, freshness detection, screenshots, code examples, templates, changelog, glossary |

These practices are enforced by each agent as part of their workflow and validated during Tech Lead review.

---

## 14. Quality Gates Summary

| Gate | Threshold | Data Source | Enforced By |
|------|-----------|-------------|-------------|
| Unit test coverage | >= 98% new/modified code | Mock data only | Developer |
| Pact contract coverage | 100% service boundaries | Mock data only | Developer |
| Integration test coverage | >= 90% | Real data | Automation |
| E2E API test coverage | >= 85% | Real data | Automation |
| E2E UI test coverage | >= 85% | Real data | Automation |
| Build pass | Green | — | DevOps |
| Folder structure | Clean root, source in src/ | — | DevOps |
| Secret detection | Zero secrets | — | DevOps |
| Security scan | No Critical/High CVEs | — | DevOps |
| Acceptance criteria | All met | — | Manual QA |
| Critical/High defects | Zero open | — | Manual QA |
| Automated test cases | All Manual QA cases covered | — | Automation |
| Automated test stability | 3 consecutive green runs | — | Automation |
| Peer review | Approved | — | Spawned review agent |
| Security review | No Critical/High issues | — | Spawned review agent |
| Architecture docs | ARCHITECTURE.md + DESIGN_DECISIONS.md current | — | Architect |

---

## 15. Non-Functional Requirements

1. **Persistence** — All agent state, memories, messages, and handoffs survive process restarts
2. **Observability** — All agent actions are logged with timestamps
3. **Idempotency** — Agents can be restarted mid-task without duplicating work
4. **Isolation** — Agents cannot modify each other's memory
5. **Auditability** — Full history of every task from creation to deployment
6. **Local-first** — The system runs entirely on the operator's machine with no cloud dependencies (target projects may deploy to cloud)

---

## 16. Out of Scope (v1)

- Multi-user support (single operator)
- Cloud-hosted deployment of the agentic system itself
- Natural language voice interface
- Auto-scaling of agent count
- Cost tracking for API usage (may add later)
- Integration with external project management tools (Jira, Linear)

---

## 17. Resolved Decisions

1. **Quality gates are configurable per project.** Each target project can set gates as mandatory (blocks advancement) or advisory (warns but allows advancement). Default is all mandatory.
2. **Dedicated Tech Lead agent for peer review and security review.** The Tech Lead is a permanent team member (Opus model) with persistent memory, not a temporary spawned agent. Builds context over time across all reviews.
3. **Parallel development is supported and encouraged.** The Architect can break a task into sub-tasks and assign them to multiple Developers simultaneously. Sub-tasks converge back before handoff to DevOps.
4. **Model assignments:**

| Agent | Model | Rationale |
|-------|-------|-----------|
| Product Manager | Opus | Planning, requirements, high-stakes decisions |
| Architect | Opus | Complex reasoning, system design, documentation |
| Tech Lead | Opus | Peer review, security review, code quality judgment |
| Dev-1 (Senior) | Opus | Complex/difficult tasks, ambiguous requirements, cross-cutting concerns |
| Dev-2 | Sonnet | Standard implementation |
| Dev-3 | Sonnet | Standard implementation |
| DevOps | Sonnet | Build pipeline, deploy, folder structure enforcement |
| Manual QA | Sonnet | Exploratory testing, defect creation, test case definition |
| Automation Engineer | Sonnet | Integration/E2E test implementation |
| Documentation Agent | Sonnet | Help articles, guides, navigation targets |

**Total agents: 10** (4 Opus, 6 Sonnet)

---

## 18. Success Criteria

The system is successful when:
1. An operator can create a task in the UI and watch it flow through all stages to deployment with minimal intervention
2. Code quality gates are consistently enforced
3. Agent handoffs contain sufficient context that downstream agents rarely need clarification
4. The Kanban board accurately reflects the state of all in-flight work
5. The system can operate on any of the operator's existing projects (gradeSnap, divestreams-v2, Wilber, fsagent)
