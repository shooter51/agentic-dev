#!/bin/sh
set -e

echo "=== agentic-dev ==="
echo "PORT:          ${PORT:-3001}"
echo "DB_PATH:       ${DB_PATH:-data/agentic-dev.db}"
echo "AGENT_RUNNER:  ${AGENT_RUNNER:-claude}"
echo "NODE_ENV:      ${NODE_ENV:-production}"
echo "==================="

cd /app/packages/backend

# Ensure data directory exists (resolve relative to cwd)
mkdir -p "$(dirname "${DB_PATH:-data/agentic-dev.db}")"

# Run backend with tsx (handles TypeScript imports from src/)
exec npx tsx src/index.ts
