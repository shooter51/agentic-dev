# ADR-0001: Monorepo Structure

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The system has two main deliverables: a TypeScript backend (agent orchestrator + REST API) and a React frontend (Kanban UI). We need to decide whether to use a single repository or separate repositories for these packages.

## Decision

Use a **single monorepo** with the following structure:

```
agentic-dev/
  packages/
    backend/        # Fastify API + agent orchestrator
    frontend/       # React Kanban UI
    shared/         # Shared types, constants, interfaces
  docs/             # PRD, ADRs, LLDs, practices
  scripts/          # Build, deploy, utility scripts
```

Use **npm workspaces** for dependency management across packages. The `shared` package contains TypeScript interfaces for API contracts, task states, message types, and agent roles — ensuring type safety across the stack.

## Alternatives Considered

1. **Separate repos** — Independent versioning and CI, but adds coordination overhead for shared types, API contract changes, and cross-cutting refactors. Rejected because the system is tightly coupled (backend and frontend evolve together) and has a single operator.

2. **Single package (no workspace)** — Simpler setup but mixes concerns. Backend dependencies bloat the frontend build. Rejected for poor separation.

3. **Nx or Turborepo** — Powerful monorepo tooling but adds complexity. With only 2-3 packages and a single operator, npm workspaces is sufficient. Can migrate later if needed.

## Consequences

- **Positive:** Shared types guarantee API contract consistency at compile time. Single PR for cross-cutting changes. Simpler CI setup.
- **Negative:** Slightly larger repo. Must be disciplined about package boundaries.
- **Risk:** npm workspaces can have hoisting issues — mitigated by pinning exact versions and using a lockfile.
