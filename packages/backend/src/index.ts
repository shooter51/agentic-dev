import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './db/index.js';
import { seedAgents } from './db/seed.js';
import { SSEBroadcaster } from './sse/broadcaster.js';
import { orchestratorPlugin } from './orchestrator/index.js';
import { registerRoutes } from './routes/index.js';
import { MessageBus } from './messaging/index.js';
import { HandoffService } from './messaging/index.js';
import { TaskPipeline } from './pipeline/index.js';
import { MemoryManager } from './memory/index.js';
import { ToolExecutor } from './tools/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env['PORT'] ?? 3001);
// ANTHROPIC_API_KEY is optional — Claude CLI uses its own auth
const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] ?? null;
const DB_PATH = process.env['DB_PATH'] ?? 'data/agentic-dev.db';
const HELP_MODEL_ID = process.env['HELP_MODEL_ID'] ?? 'claude-sonnet-4-6';
const AUTH_BYPASS = process.env['AUTH_BYPASS'] === 'true';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function start() {
  const server = Fastify({ logger: true });

  // -- Config decorator -------------------------------------------------------
  server.decorate('config', {
    PORT,
    ANTHROPIC_API_KEY,
    DB_PATH,
    HELP_MODEL_ID,
    AUTH_BYPASS,
  });

  // -- CORS -------------------------------------------------------------------
  await server.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // -- DB migrations ----------------------------------------------------------
  migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });

  // -- ALTER TABLE: add lastError column if not exists -----------------------
  try {
    await db.run(sql`ALTER TABLE agents ADD COLUMN last_error TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // -- DB seed ----------------------------------------------------------------
  await seedAgents(db);

  // -- Service instantiation --------------------------------------------------
  const sseBroadcaster = new SSEBroadcaster();

  // Decorator so routes can access the broadcaster
  server.decorate('sseBroadcaster', sseBroadcaster);

  const messageBus = new MessageBus(db);
  const pipeline = new TaskPipeline(db, sseBroadcaster);
  const memoryManager = new MemoryManager(db);
  const handoffService = new HandoffService(db);
  const toolExecutor = new ToolExecutor(
    db,
    { commandTimeoutMs: 120_000, messageTimeoutMs: 600_000 },
    messageBus,
    memoryManager,
  );

  // -- Service decorators -----------------------------------------------------
  server.decorate('pipeline', pipeline);
  server.decorate('memoryManager', memoryManager);
  server.decorate('handoffService', handoffService);
  server.decorate('messageBus', messageBus);

  // -- Orchestrator plugin ----------------------------------------------------
  await server.register(orchestratorPlugin, {
    db,
    messageBus,
    pipeline,
    memoryManager,
    handoffService,
    toolExecutor,
    sseBroadcaster,
  });

  // -- Recover pending messages after orchestrator is initialized -------------
  await messageBus.recoverPendingMessages();

  // -- Routes -----------------------------------------------------------------
  await registerRoutes(server);

  // -- Start ------------------------------------------------------------------
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // -- Graceful shutdown ------------------------------------------------------
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down…`);
    sseBroadcaster.shutdown();
    messageBus.shutdown();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
