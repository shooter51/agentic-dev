# Agentic Dev — Claude Code Project Instructions

## Documentation — MUST Stay Current

**Every PR that changes user-facing behavior must update docs and screenshots.**

### What triggers a docs update

- New or changed UI components, pages, or layouts
- New or changed API endpoints
- New or changed CLI flags, env vars, or configuration
- New or changed pipeline stages, agents, or quality gates
- New or changed Docker setup or deployment process
- Architecture changes (new packages, major refactors, new subsystems)

### What to update

| Change Type | Update |
|-------------|--------|
| UI change | Re-run `npx tsx scripts/screenshots.ts` and commit updated screenshots |
| New feature | Add to README.md Features section |
| New env var | Add to README.md Configuration table and docker-compose.yml |
| API change | Update README.md API section |
| Architecture change | Update docs/ARCHITECTURE.md |
| New ADR | Add to docs/adr/ and reference in ARCHITECTURE.md |
| Pipeline/agent change | Update README.md Agents table and ARCHITECTURE.md Pipeline section |

### Screenshots

Screenshots live in `docs/screenshots/`. The capture script is `scripts/screenshots.ts`.

To regenerate all screenshots (requires backend on :3001 and frontend on :5173):
```bash
npx tsx scripts/screenshots.ts
```

**Never commit stale screenshots.** If your change affects the UI, re-run the script and commit the updated images.

---

## Tech Stack

- **Monorepo**: npm workspaces (packages/shared, packages/backend, packages/frontend)
- **Backend**: Fastify v5, SQLite (better-sqlite3), Drizzle ORM, TypeScript
- **Frontend**: React 19, Vite 6, Tailwind CSS v4, TanStack Query, Zustand
- **Agent runner**: Claude Code CLI or OpenCode CLI (configurable via AGENT_RUNNER env var)
- **Database**: SQLite at DB_PATH (default: data/agentic-dev.db)

## Development

- Start backend from `packages/backend`: `npx tsx src/index.ts`
- Start frontend from `packages/frontend`: `npx vite --host`
- **Never** start Vite from the repo root — it will scan backend files and crash
- **Never** start the backend from the repo root — tsx will scan frontend files

## Testing

- Backend tests: `cd packages/backend && npm test`
- Frontend tests: `cd packages/frontend && npm test`
- E2E tests: `npx playwright test` (both servers must be running)
- Run `npm run typecheck` before pushing

## Code Conventions

- Strict TypeScript with project references
- ES modules throughout
- Co-locate tests with source files (*.test.ts)
- Use Drizzle ORM for DB access; raw `db.run(sql`...`)` only for sync hot paths
- Use TanStack Query for all frontend API calls
- Tailwind CSS v4 for styling — no CSS files
