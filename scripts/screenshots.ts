import { chromium } from '@playwright/test';
import path from 'path';

const BASE = 'http://localhost:5173';
const OUT = path.resolve('docs/screenshots');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  // 1. Board page — full kanban view
  console.log('1/6 Board page...');
  const board = await context.newPage();
  await board.goto(BASE);
  await board.waitForTimeout(2000);
  await board.screenshot({ path: path.join(OUT, 'board.png') });

  // 2. Task detail — click first task card
  console.log('2/6 Task detail...');
  const card = board.locator('button').filter({ hasText: /P[0-4]/ }).first();
  if (await card.isVisible()) {
    await card.click();
    await board.waitForTimeout(500);
    await board.screenshot({ path: path.join(OUT, 'task-detail.png') });
    await board.keyboard.press('Escape');
  }

  // 3. Agent panel — click an agent card
  console.log('3/6 Agent detail...');
  const agentCard = board.locator('[class*="rounded-lg border"]').filter({ hasText: 'Architect' }).first();
  if (await agentCard.isVisible()) {
    await agentCard.click();
    await board.waitForTimeout(500);
    await board.screenshot({ path: path.join(OUT, 'agent-detail.png') });
    await board.keyboard.press('Escape');
    await board.waitForTimeout(300);
  }

  // 4. New task dialog
  console.log('4/6 New task dialog...');
  await board.getByRole('button', { name: 'New Task' }).click();
  await board.waitForTimeout(300);
  await board.screenshot({ path: path.join(OUT, 'new-task.png') });
  await board.keyboard.press('Escape');

  // 5. Stats page
  console.log('5/6 Stats page...');
  const stats = await context.newPage();
  await stats.goto(`${BASE}/stats`);
  await stats.waitForTimeout(1500);
  await stats.screenshot({ path: path.join(OUT, 'stats.png') });

  // 6. Board with compact mode — toggle compact
  console.log('6/6 Compact board...');
  const compact = await context.newPage();
  await compact.goto(BASE);
  await compact.waitForTimeout(1500);
  // Click the compact mode toggle (Rows3 icon button)
  const compactBtn = compact.getByTitle('Compact view');
  if (await compactBtn.isVisible()) {
    await compactBtn.click();
    await compact.waitForTimeout(500);
  }
  await compact.screenshot({ path: path.join(OUT, 'board-compact.png') });

  await browser.close();
  console.log(`Done — screenshots saved to ${OUT}`);
}

main().catch(console.error);
