# ADR-0009: Task Pipeline Engine — Finite State Machine

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

Tasks flow through 12 stages (Todo → Product → Architecture → Development → Tech Lead Review → DevOps Build → Manual QA → Automation → Documentation → DevOps Deploy → Arch Review → Done). Each transition has quality gates that must pass. Tasks can also be sent back to previous stages (rejections) or closed without completion. We need a reliable mechanism to manage these transitions.

## Decision

Implement the task pipeline as a **finite state machine (FSM)** with defined states, transitions, and guards.

### States

```typescript
enum TaskStage {
  TODO = 'todo',
  PRODUCT = 'product',
  ARCHITECTURE = 'architecture',
  DEVELOPMENT = 'development',
  TECH_LEAD_REVIEW = 'tech_lead_review',
  DEVOPS_BUILD = 'devops_build',
  MANUAL_QA = 'manual_qa',
  AUTOMATION = 'automation',
  DOCUMENTATION = 'documentation',
  DEVOPS_DEPLOY = 'devops_deploy',
  ARCH_REVIEW = 'arch_review',
  DONE = 'done',
  CANCELLED = 'cancelled',
  DEFERRED = 'deferred',
}
```

**Terminal states:** `DONE`, `CANCELLED`, `DEFERRED`. Tasks in terminal states cannot transition further unless explicitly reopened by the operator.

- **Cancelled:** Task is permanently closed without completion. Reason required. Used for defects marked as won't-fix or duplicate, or features that are no longer needed.
- **Deferred:** Task is paused indefinitely. Can be reopened later by the operator, re-entering the pipeline at its previous stage. Used for low-priority items or items blocked on external dependencies.

### Forward Transitions

Each forward transition requires all quality gates for the current stage to pass:

```
todo → product              (operator moves task to backlog)
product → architecture      (PRD complete, acceptance criteria defined)
architecture → development  (ADR + LLD complete, developer assigned)
development → tech_lead_review  (code complete, 98% unit, 100% pact, tests pass)
tech_lead_review → devops_build  (peer review approved, security review clean)
devops_build → manual_qa    (build passes, folder structure clean, no secrets)
manual_qa → automation      (acceptance criteria met, test cases written, no critical defects)
automation → documentation  (all tests automated, 90% integration, 85% E2E, 3x stable)
documentation → devops_deploy  (help articles current, guide updated, nav targets valid)
devops_deploy → arch_review (deployed, health check passes)
arch_review → done          (ARCHITECTURE.md + DESIGN_DECISIONS.md updated)
```

### Backward Transitions (Rejections)

Any stage can send a task back with a reason:

```
tech_lead_review → development       (review changes requested)
devops_build → development           (build failure, structure violation)
manual_qa → development              (defect found)
automation → development             (test reveals bug)
arch_review → architecture           (fundamental design issue found)
arch_review → development            (implementation deviated from design)
```

### Cancel/Defer Transitions

Any active stage can transition to `cancelled` or `deferred` (operator-initiated only):

```
any active stage → cancelled     (operator cancels with reason)
any active stage → deferred      (operator defers with reason)
deferred → [previous stage]      (operator reopens)
```

### Guards

Each transition has a guard function that checks quality gates:

```typescript
interface TransitionGuard {
  stage: TaskStage;
  check: (task: Task) => { pass: boolean; failures: string[] };
}
```

Guards are **configurable per project** (ADR resolving PRD Section 17, Decision 1). Each project can mark gates as `mandatory` (blocks transition) or `advisory` (warns but allows).

### Defect Auto-Flow

When QA creates a defect:
1. A new task is created with `type: bug` and linked to the parent via `parent_task_id`.
2. The defect task enters a **shortened pipeline based on severity:**
   - **All defects (default):** `development → tech_lead_review → devops_build → manual_qa → automation → devops_deploy` — skip Architecture, go straight to fix.
   - **Architectural defect (rare):** If the Architect or Tech Lead determines the defect requires a design change, the defect task is routed to `architecture → development → ...` instead. This is an explicit reclassification, not automatic.
3. The parent task remains blocked at its current stage until all child defects reach `done` or `cancelled` (won't-fix defects unblock the parent).

### Parallel Sub-Tasks

When the Architect breaks a task into sub-tasks:
1. Sub-tasks are created with `parent_task_id` set to the main task and `type: task`.
2. Each sub-task gets its own branch off the parent feature branch.
3. Sub-tasks flow through the pipeline independently.
4. The parent task's `development` stage is not complete until all sub-tasks complete their `development` stage.
5. **Rejection during parallel development:** If a sub-task is rejected back from Tech Lead Review to Development, the parent task remains blocked. All sub-tasks must re-complete Development before convergence can proceed.
6. **Convergence at Tech Lead Review:** When all sub-tasks reach `tech_lead_review`, the orchestrator merges sub-task branches into the parent feature branch sequentially (see ADR-0003 "Concurrent Repo Access"). The Tech Lead then reviews the combined diff on the parent branch — a single unified review, not separate reviews per sub-task. If merge conflicts arise during convergence, the conflicting sub-task is sent back to its developer.
7. After Tech Lead approval, the parent task continues through the pipeline as a single unit.

### State Transition Logging

Every transition is recorded in `task_history` with the previous stage, new stage, triggering agent, and any guard results.

## Alternatives Considered

1. **Workflow engine library (e.g., xstate)** — xstate is a mature, well-tested state machine library that handles exactly this type of problem. However, the pipeline's complexity is bounded and well-understood: 14 states, forward/backward transitions, guards, and parent-child relationships. A custom FSM with a data-driven transition table is more transparent for debugging (the full state machine is visible in one file) and avoids learning xstate's actor model and serialization semantics. **Revisit this decision** if the FSM implementation exceeds 500 lines or if we add dynamic stage insertion — at that point, xstate's formal guarantees justify the dependency.

2. **Event-driven pipeline** — Tasks emit events, handlers react. More flexible but harder to reason about transition ordering and guard enforcement. Rejected.

3. **Simple status field updates** — No formal state machine. Allows invalid transitions. Rejected.

## Consequences

- **Positive:** Invalid transitions are impossible. Quality gates are enforced at the state machine level. Full audit trail. Configurable per project. Supports forward, backward, and parallel flows.
- **Negative:** Adding new stages requires updating the FSM definition. Mitigated by keeping the FSM configuration data-driven.
- **Risk:** Complex guard logic could slow transitions. Mitigated by keeping guards simple and fast (DB queries, not external calls).
