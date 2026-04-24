import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';
const TIMEOUT = 600_000; // 10 minutes for full pipeline

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET' && method !== 'HEAD') {
    opts.body = body !== undefined ? JSON.stringify(body) : '{}';
  }
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function getTask(taskId: string) {
  return api('GET', `/api/tasks/${taskId}`);
}

async function getAgents() {
  return api('GET', '/api/agents') as Promise<Array<{ id: string; status: string }>>;
}

async function waitForStage(taskId: string, targetStage: string, timeoutMs: number = 120_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await getTask(taskId);
    if (task.stage === targetStage) return true;
    if (task.stage === 'cancelled' || task.stage === 'deferred') return false;
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}

async function waitForNotStage(taskId: string, currentStage: string, timeoutMs: number = 120_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await getTask(taskId);
    if (task.stage !== currentStage) return task.stage;
    await new Promise(r => setTimeout(r, 3000));
  }
  return currentStage; // timed out
}

const PIPELINE_STAGES = [
  'product', 'architecture', 'development', 'tech_lead_review',
  'devops_build', 'manual_qa', 'automation', 'documentation',
  'devops_deploy', 'arch_review', 'done',
];

// ============================================================
// State Machine Tests
// ============================================================

test.describe('Pipeline State Machine', () => {
  test.setTimeout(TIMEOUT);

  test('task creation puts task in correct initial stage', async () => {
    const projects = await api('GET', '/api/projects');
    const project = projects[0];

    const task = await api('POST', `/api/projects/${project.id}/tasks`, {
      title: 'SM Test: Initial Stage',
      description: 'Verify task starts in todo',
      priority: 'P3',
      type: 'task',
    });

    expect(task.stage).toBe('todo');
    expect(task.assignedAgent).toBeNull();
    expect(task.projectId).toBe(project.id);

    // Clean up - cancel the task
    await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cleanup' });
  });

  test('force-move advances task to any valid stage', async () => {
    const projects = await api('GET', '/api/projects');
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: Force Move',
      priority: 'P3',
      type: 'task',
    });

    // Move through several stages
    for (const stage of ['product', 'architecture', 'development', 'done']) {
      const result = await api('POST', `/api/tasks/${task.id}/move`, { stage });
      expect(result.success).toBe(true);
      const updated = await getTask(task.id);
      expect(updated.stage).toBe(stage);
    }
  });

  test('force-move rejects invalid stage names', async () => {
    const projects = await api('GET', '/api/projects');
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: Invalid Stage',
      priority: 'P3',
      type: 'task',
    });

    const result = await api('POST', `/api/tasks/${task.id}/move`, { stage: 'nonexistent' });
    expect(result.error || result.statusCode).toBeTruthy();

    await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cleanup' });
  });

  test('cancel moves task to cancelled stage', async () => {
    const projects = await api('GET', '/api/projects');
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: Cancel',
      priority: 'P3',
      type: 'task',
    });

    await api('POST', `/api/tasks/${task.id}/move`, { stage: 'development' });
    const result = await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cancel' });
    expect(result.success).toBe(true);

    const updated = await getTask(task.id);
    expect(updated.stage).toBe('cancelled');
  });

  test('retry endpoint clears assignment and allows re-dispatch', async () => {
    const projects = await api('GET', '/api/projects');
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: Retry',
      priority: 'P3',
      type: 'task',
    });

    // Move to product and simulate stuck assignment
    await api('POST', `/api/tasks/${task.id}/move`, { stage: 'product' });

    // Retry should clear assignment
    const result = await api('POST', `/api/tasks/${task.id}/retry`);
    expect(result.success).toBe(true);

    const updated = await getTask(task.id);
    expect(updated.assignedAgent).toBeNull();

    await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cleanup' });
  });

  test('task metadata can be updated via PATCH', async () => {
    const projects = await api('GET', '/api/projects');
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: Metadata',
      priority: 'P3',
      type: 'task',
    });

    // Update metadata
    const updated = await api('PATCH', `/api/tasks/${task.id}`, {
      metadata: { unitCoverage: 99, buildPassed: true },
    });

    const meta = JSON.parse(updated.metadata);
    expect(meta.unitCoverage).toBe(99);
    expect(meta.buildPassed).toBe(true);

    await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cleanup' });
  });

  test('task history records stage transitions', async () => {
    const projects = await api('GET', '/api/projects');
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: History',
      priority: 'P3',
      type: 'task',
    });

    await api('POST', `/api/tasks/${task.id}/move`, { stage: 'product' });
    await api('POST', `/api/tasks/${task.id}/move`, { stage: 'architecture' });

    const history = await api('GET', `/api/tasks/${task.id}/history`);
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const stageChanges = history.filter((h: any) => h.event === 'stage_change');
    expect(stageChanges.length).toBeGreaterThanOrEqual(2);

    await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cleanup' });
  });

  test('handoffs endpoint returns valid array for completed tasks', async () => {
    // Check handoffs endpoint works on existing completed tasks
    const projects = await api('GET', '/api/projects');
    const board = await api('GET', `/api/projects/${projects[0].id}/board`);
    const doneTasks = board['done'] ?? [];

    if (doneTasks.length > 0) {
      const handoffs = await api('GET', `/api/tasks/${doneTasks[0].id}/handoffs`);
      expect(Array.isArray(handoffs)).toBe(true);

      // If handoffs exist, verify their structure
      for (const h of handoffs) {
        expect(h).toHaveProperty('fromStage');
        expect(h).toHaveProperty('toStage');
        expect(h).toHaveProperty('fromAgent');
        expect(h).toHaveProperty('content');
        expect(h.content.length).toBeGreaterThan(0);
      }
    }

    // Also verify handoffs endpoint works for a fresh task (returns empty array)
    const task = await api('POST', `/api/projects/${projects[0].id}/tasks`, {
      title: 'SM Test: Handoffs Empty',
      priority: 'P3',
      type: 'task',
    });
    const freshHandoffs = await api('GET', `/api/tasks/${task.id}/handoffs`);
    expect(Array.isArray(freshHandoffs)).toBe(true);
    expect(freshHandoffs.length).toBe(0);

    await api('POST', `/api/tasks/${task.id}/cancel`, { reason: 'test cleanup' });
  });

  test('agent statuses are valid enum values', async () => {
    const agents = await getAgents();
    const validStatuses = ['idle', 'working', 'busy', 'paused', 'error'];
    for (const agent of agents) {
      expect(validStatuses).toContain(agent.status);
    }
  });

  test('all 10 agents are registered', async () => {
    const agents = await getAgents();
    expect(agents.length).toBe(10);

    const ids = agents.map(a => a.id).sort();
    expect(ids).toContain('product-manager');
    expect(ids).toContain('architect');
    expect(ids).toContain('tech-lead');
    expect(ids).toContain('dev-1');
    expect(ids).toContain('dev-2');
    expect(ids).toContain('dev-3');
    expect(ids).toContain('devops');
    expect(ids).toContain('manual-qa');
    expect(ids).toContain('automation');
    expect(ids).toContain('documentation');
  });

  test('agent pause and resume cycle works', async () => {
    // Pause
    const pauseResult = await api('POST', '/api/agents/dev-3/pause');
    expect(pauseResult.success).toBe(true);
    let agent = (await getAgents()).find(a => a.id === 'dev-3');
    expect(agent?.status).toBe('paused');

    // Resume
    const resumeResult = await api('POST', '/api/agents/dev-3/resume');
    expect(resumeResult.success).toBe(true);
    agent = (await getAgents()).find(a => a.id === 'dev-3');
    expect(agent?.status).toBe('idle');
  });

  test('board view returns tasks grouped by stage', async () => {
    const projects = await api('GET', '/api/projects');
    const board = await api('GET', `/api/projects/${projects[0].id}/board`);

    expect(typeof board).toBe('object');
    // Board should have string keys (stage names)
    for (const [stage, tasks] of Object.entries(board)) {
      expect(typeof stage).toBe('string');
      expect(Array.isArray(tasks)).toBe(true);
    }
  });

  test('"all" board view returns tasks across all projects', async () => {
    const board = await api('GET', '/api/projects/all/board');
    expect(typeof board).toBe('object');

    // Count total tasks across all stages
    let total = 0;
    for (const tasks of Object.values(board)) {
      total += (tasks as any[]).length;
    }
    expect(total).toBeGreaterThanOrEqual(1);
  });

  test('auto-gate metadata is set after agent completion (verify on done tasks)', async () => {
    const projects = await api('GET', '/api/projects');
    const board = await api('GET', `/api/projects/${projects[0].id}/board`);
    const doneTasks = board['done'] ?? [];

    if (doneTasks.length > 0) {
      const task = await getTask(doneTasks[0].id);
      if (task.metadata) {
        const meta = JSON.parse(task.metadata);
        // Done tasks should have at least some gate metadata set by autoSetGateMetadata
        const gateKeys = Object.keys(meta).filter(k => !k.match(/^\d+$/)); // skip char-index keys
        expect(gateKeys.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('cost stats accumulate across agent runs', async () => {
    const stats = await api('GET', '/api/stats/costs');
    expect(stats.totals).toBeDefined();
    // If agents have run, there should be some cost
    if (stats.totals.estimatedCostUsd > 0) {
      expect(stats.perAgent.length).toBeGreaterThan(0);
      expect(stats.perAgent.some((a: any) => a.estimatedCostUsd > 0)).toBe(true);
    }
  });

  test('pipeline stats track tasks by stage', async () => {
    const stats = await api('GET', '/api/stats/pipeline');
    expect(stats.tasksByStage).toBeDefined();
    expect(typeof stats.totalApiCalls).toBe('number');
    expect(typeof stats.avgLatencyMs).toBe('number');
  });
});
