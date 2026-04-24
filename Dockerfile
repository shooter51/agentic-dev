# =============================================================================
# agentic-dev — multi-stage Docker build
#
# Builds the full monorepo (shared → backend → frontend) and produces a
# single container that serves the API, static frontend, and includes both
# Claude Code and OpenCode CLIs for running agents.
#
# Usage:
#   docker build -t agentic-dev .
#   docker run -p 3001:3001 -v agentic-data:/app/packages/backend/data \
#     -e ANTHROPIC_API_KEY=sk-... agentic-dev
#
# Env vars:
#   PORT              — API port (default 3001)
#   DB_PATH           — SQLite path (default data/agentic-dev.db)
#   ANTHROPIC_API_KEY — Required for Claude agents
#   AGENT_RUNNER      — "claude" or "opencode" (default "claude")
#   OPENCODE_OPUS_MODEL / OPENCODE_SONNET_MODEL — model overrides for opencode
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: install + build
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /build

# Install build tools for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace config first for layer caching
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

# Install all deps (including devDeps for build)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
COPY packages/frontend/ packages/frontend/

# Build shared → backend → frontend
RUN npm run build --workspace=packages/shared \
    && npm run build --workspace=packages/backend \
    && npm run build --workspace=packages/frontend

# ---------------------------------------------------------------------------
# Stage 2: production image
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Install build tools for better-sqlite3, curl for healthcheck, git for agents
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

# --- Install Claude Code CLI ---
RUN npm install -g @anthropic-ai/claude-code

# --- Install OpenCode CLI ---
RUN npm install -g opencode-ai

# Copy workspace config
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

# Install production deps (builds better-sqlite3 native addon), then remove build tools
RUN npm ci --omit=dev \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts from builder
COPY --from=builder /build/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /build/packages/backend/dist/ packages/backend/dist/
COPY --from=builder /build/packages/frontend/dist/ packages/frontend/dist/

# Copy backend source for tsx (some imports resolve to src/)
COPY --from=builder /build/packages/backend/src/ packages/backend/src/
COPY --from=builder /build/packages/backend/tsconfig.json packages/backend/

# Copy drizzle migrations
COPY --from=builder /build/packages/backend/drizzle.config.ts packages/backend/
COPY packages/backend/src/db/migrations/ packages/backend/src/db/migrations/

# Copy .env.example as reference
COPY .env.example ./

# Create data directory for SQLite
RUN mkdir -p /app/packages/backend/data

# Entrypoint
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Point cli-runner at the globally installed binaries
ENV CLAUDE_BIN=/usr/local/bin/claude
ENV OPENCODE_BIN=/usr/local/bin/opencode

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=data/agentic-dev.db
ENV AGENT_RUNNER=claude

EXPOSE 3001

# Volume for persistent data (SQLite DB, agent memories)
VOLUME ["/app/packages/backend/data"]

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/agents || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
