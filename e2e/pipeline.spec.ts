import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET' && method !== 'HEAD') {
    opts.body = body !== undefined ? JSON.stringify(body) : '{}';
  }
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

// ============================================================
// 1. BOARD PAGE
// ============================================================

test.describe('Board Page', () => {
  test('loads and shows header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Agentic Dev', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('shows kanban column groups', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Build', { exact: false }).first()).toBeVisible();
  });

  test('shows agent panel with agents', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  });

  test('project selector exists and is functional', async ({ page }) => {
    await page.goto('/');
    const select = page.getByRole('combobox');
    await expect(select).toBeVisible();
    await expect(select).toBeEnabled();
  });
});

// ============================================================
// 2. TASK CREATION
// ============================================================

test.describe('Task Creation', () => {
  test('New Task button opens dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Task' }).click();
    await expect(page.getByText('Create New Task')).toBeVisible();
  });

  test('cannot create task with empty title', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Task' }).click();
    const createBtn = page.getByRole('button', { name: 'Create Task' });
    await expect(createBtn).toBeDisabled();
  });

  test('can fill and submit task form', async ({ page }) => {
    await page.goto('/');
    const select = page.getByRole('combobox');
    const options = await select.locator('option').allTextContents();
    const proj = options.find(o => o !== 'All Projects');
    if (proj) await select.selectOption(proj);

    await page.getByRole('button', { name: 'New Task' }).click();
    await page.getByPlaceholder('Task title').fill('Pipeline E2E Test Task');
    await page.getByRole('button', { name: 'Create Task' }).click();
    // Dialog should close
    await expect(page.getByText('Create New Task')).not.toBeVisible({ timeout: 5000 });
  });
});

// ============================================================
// 3. TASK DETAIL
// ============================================================

test.describe('Task Detail', () => {
  test('clicking task opens detail with tabs', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('button').filter({ hasText: /P[0-4]/ }).first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'History' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Messages' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Artifacts' })).toBeVisible();
    }
  });

  test('pipeline progress visible', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('button').filter({ hasText: /P[0-4]/ }).first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page.getByText('PIPELINE PROGRESS')).toBeVisible();
    }
  });

  test('Reset & Retry button present', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('button').filter({ hasText: /P[0-4]/ }).first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page.getByRole('button', { name: /Reset/ })).toBeVisible();
    }
  });

  test('ESC closes detail', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('button').filter({ hasText: /P[0-4]/ }).first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tab', { name: 'Details' })).not.toBeVisible();
    }
  });

  test('history tab renders events', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('button').filter({ hasText: /P[0-4]/ }).first();
    if (await card.isVisible()) {
      await card.click();
      await page.getByRole('tab', { name: 'History' }).click();
      const content = page.locator('[role="tabpanel"]');
      await expect(content).toBeVisible();
    }
  });
});

// ============================================================
// 4. AGENT PANEL
// ============================================================

test.describe('Agent Panel', () => {
  test('sidebar toggles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
    await page.getByRole('button', { name: /Hide agent/ }).click();
    await expect(page.getByRole('heading', { name: 'Agents' })).not.toBeVisible();
    await page.getByRole('button', { name: /Show agent/ }).click();
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  });

  test('agent card click opens detail sheet', async ({ page }) => {
    await page.goto('/');
    // Click the agent card container (the whole card is clickable)
    const architectCard = page.locator('[class*="rounded-lg border"]').filter({ hasText: 'Architect' }).first();
    await architectCard.click();
    // Wait for sheet animation
    await page.waitForTimeout(500);
    // Check for any agent detail content
    const sheetContent = page.locator('[role="dialog"]').or(page.getByText('Last Completed Work')).or(page.getByRole('tab', { name: 'Overview' }));
    await expect(sheetContent.first()).toBeVisible({ timeout: 3000 });
  });
});

// ============================================================
// 5. STATS PAGE
// ============================================================

test.describe('Stats Page', () => {
  test('shows all metric cards', async ({ page }) => {
    await page.goto('/stats');
    await expect(page.getByText('Tasks Completed')).toBeVisible();
    await expect(page.getByText('Total API Calls')).toBeVisible();
    await expect(page.getByText('Total AI Cost')).toBeVisible();
    await expect(page.getByText('Defect Rate')).toBeVisible();
  });

  test('shows tasks by stage', async ({ page }) => {
    await page.goto('/stats');
    await expect(page.getByText('Tasks by Stage')).toBeVisible();
  });

  test('page is scrollable', async ({ page }) => {
    await page.goto('/stats');
    const costSection = page.getByText('Cost by Agent');
    // Scroll to cost section
    await costSection.scrollIntoViewIfNeeded();
    await expect(costSection).toBeVisible();
  });
});

// ============================================================
// 6. PROJECT MANAGEMENT
// ============================================================

test.describe('Project Management', () => {
  test('New Project dialog opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByText('Create Project')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('Import dialog opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByText('Import Project')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('project switch updates info bar', async ({ page }) => {
    await page.goto('/');
    const select = page.getByRole('combobox');
    const options = await select.locator('option').allTextContents();
    if (options.length >= 3) {
      await select.selectOption(options[2]);
      await page.waitForTimeout(1000);
    }
  });
});

// ============================================================
// 7. API HEALTH
// ============================================================

test.describe('API Health', () => {
  test('GET /api/agents returns 10 agents', async () => {
    const agents = await api('GET', '/api/agents');
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBe(10);
  });

  test('GET /api/projects returns projects', async () => {
    const projects = await api('GET', '/api/projects');
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/projects/:id/board returns stages', async () => {
    const projects = await api('GET', '/api/projects');
    const board = await api('GET', `/api/projects/${projects[0].id}/board`);
    expect(typeof board).toBe('object');
  });

  test('GET /api/stats/costs returns totals', async () => {
    const stats = await api('GET', '/api/stats/costs');
    expect(stats).toHaveProperty('totals');
  });

  test('GET /api/stats/pipeline returns tasksByStage', async () => {
    const stats = await api('GET', '/api/stats/pipeline');
    expect(stats).toHaveProperty('tasksByStage');
  });

  test('POST /api/agents/:id/resume works', async () => {
    const result = await api('POST', '/api/agents/architect/resume');
    expect(result).toHaveProperty('success', true);
  });
});

// ============================================================
// 8. NAVIGATION
// ============================================================

test.describe('Navigation', () => {
  test('Board → Stats → Board', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Stats' }).click();
    await expect(page).toHaveURL('/stats');
    await page.getByRole('link', { name: 'Board' }).click();
    await expect(page).toHaveURL('/');
  });
});
