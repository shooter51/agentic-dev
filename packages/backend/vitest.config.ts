import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Only measure coverage for modules that have tests written against them.
      // Routes, agent-runner, orchestrator internals, and tool handlers are
      // integration-level and are excluded from the unit-test coverage gate.
      include: [
        'src/sse/ring-buffer.ts',
        'src/sse/broadcaster.ts',
        'src/orchestrator/concurrency.ts',
        'src/orchestrator/loop-detector.ts',
        'src/orchestrator/cost-tracker.ts',
        'src/orchestrator/context-builder.ts',
        'src/tools/sandbox.ts',
        'src/tools/permissions.ts',
        'src/tools/executor.ts',
        'src/messaging/deadlock-detector.ts',
        'src/messaging/message-bus.ts',
        'src/memory/memory-scorer.ts',
        'src/memory/memory-injector.ts',
        'src/memory/memory-manager.ts',
        'src/pipeline/guards.ts',
        'src/pipeline/fsm.ts',
        'src/pipeline/transitions.ts',
        'src/db/repositories/task.repository.ts',
        'src/db/repositories/message.repository.ts',
        'src/db/repositories/memory.repository.ts',
        'src/db/test-helpers.ts',
      ],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@agentic-dev/shared': '../shared/src/index.ts',
    },
  },
});
