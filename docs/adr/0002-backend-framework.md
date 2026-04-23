# ADR-0002: Backend Framework — Fastify

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The backend must serve a REST API for the React frontend, manage SSE connections for real-time updates, orchestrate 10 AI agents via the Anthropic SDK, handle inter-agent messaging, and manage a SQLite database. We need a Node.js framework with strong TypeScript support, lifecycle hooks for managing long-running agent processes, and good performance under frequent state updates.

## Decision

Use **Fastify v5** as the backend framework.

## Alternatives Considered

1. **Express** — Mature with the largest ecosystem, but TypeScript support is bolted-on via `@types/express`. Lacks built-in schema validation and lifecycle hooks for managing agent processes. No meaningful advantage over Fastify for a new project.

2. **Hono** — Excellent for edge/serverless workloads with first-class TypeScript. However, it's optimized for short-lived request/response cycles, not long-running agent processes with persistent connections. Wrong fit for this use case.

## Rationale

- **TypeScript:** First-class support. Schemas typed end-to-end via `@fastify/type-provider-zod`.
- **Lifecycle hooks:** `onReady` and `onClose` hooks provide clean startup/shutdown for agent worker pool.
- **Plugin system:** Encapsulated plugins map naturally to subsystems — agent pool, SSE broadcaster, task pipeline.
- **Performance:** ~2x Express throughput, relevant when 10 agents generate frequent state updates.
- **SSE support:** Native response streaming for SSE with no additional library.
- **Drizzle compatibility:** No opinions on data layer — clean integration.

**Key pattern:** Register a plugin that initializes the agent pool and decorates the Fastify instance (`fastify.decorate('agents', pool)`). Route handlers and SSE handlers share the same agent references.

## Consequences

- **Positive:** Better TypeScript ergonomics, superior performance, purpose-built lifecycle hooks for persistent processes.
- **Negative:** Smaller ecosystem than Express. Some middleware requires Fastify-specific wrappers.
- **Risk:** Team must learn Fastify's plugin model. Mitigated by strong documentation and similarity to Express patterns.
