# Contributing

## Development Setup

```bash
git clone https://github.com/shooter51/agentic-dev.git
cd agentic-dev
npm install
```

### Running Locally

Start both servers from their respective directories:

```bash
# Terminal 1: Backend
cd packages/backend
npx tsx src/index.ts

# Terminal 2: Frontend
cd packages/frontend
npx vite --host
```

Dashboard at `http://localhost:5173`, API at `http://localhost:3001`.

### Running Tests

```bash
# Backend unit tests
cd packages/backend && npm test

# Frontend unit tests
cd packages/frontend && npm test

# E2E tests (both servers must be running)
npx playwright test

# Type checking
npm run typecheck
```

## Project Structure

```
packages/
  shared/     # Shared types — no runtime deps, just TypeScript interfaces
  backend/    # Fastify API, orchestrator, pipeline, memory, messaging
  frontend/   # React dashboard with Vite
```

All source lives under `packages/*/src/`. Tests are co-located with source files (`*.test.ts`).

## Conventions

- TypeScript strict mode with project references
- ES modules throughout (`"type": "module"`)
- Drizzle ORM for database access — no raw SQL except in sync `db.run()` hot paths
- TanStack Query for all API calls in the frontend
- Tailwind CSS v4 for styling — no CSS files

## Pull Requests

1. Create a feature branch
2. Make your changes
3. Run `npm run typecheck` and `npm test` in both packages
4. Open a PR with a clear description

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
