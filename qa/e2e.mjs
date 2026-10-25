/**
 * Browser verification for TaskForge: three real users in three isolated browser
 * contexts, exercising the realtime path, drag & drop, RBAC and the task drawer.
 *
 *   npm run test:e2e
 *
 * Starts the API and the Vite dev server itself, drives Chromium with real pointer
 * gestures, writes screenshots to qa/shots/, and fails on any uncaught page error.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is an optional dev dependency: resolve it from either this repo's
// node_modules or a global install, and say so plainly if it is missing.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright is not installed.\n  npm install --save-dev playwright\n  npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'qa', 'shots');
const APP = 'http://localhost:5173';

let pass = 0;
const fails = [];
const check = (name, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fails.push(name); console.log(`  FAIL  ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
const run = (cwd, cmd, args, env = {}) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => { const s = String(d); if (/error/i.test(s)) process.stderr.write(`  [srv] ${s}`); });
  procs.push(child);
  return child;
};

const waitFor = async (url, tries = 90) => {
  for (let i = 0; i < tries; i += 1) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* retry */ }
    await sleep(500);
  }
  return false;
};

/** dnd-kit needs a real pointer gesture: press, move past the threshold, drop. */
const dragCard = async (page, cardSelector, targetColumnName) => {
  const card = page.locator(cardSelector).first();
  const target = page.locator('.column', { has: page.locator('.column__title', { hasText: targetColumnName }) }).first();
  const from = await card.boundingBox();
  const to = await target.locator('.column__body').boundingBox();
  if (!from || !to) throw new Error('could not locate drag endpoints');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2, to.y + 70, { steps: 4 });
  await page.mouse.up();
};

const signIn = async (page, email) => {
  await page.goto(`${APP}/login`);
  await page.waitForSelector('form');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'Password123!');
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('.project-card', { timeout: 20000 });
};

const openProject = async (page, name) => {
  await page.click(`.project-card:has-text("${name}")`);
  await page.waitForSelector('.column', { timeout: 20000 });
  await page.waitForSelector('.live-dot.is-live', { timeout: 20000 });
};

const main = async () => {
  run(`${ROOT}/apps/api`, 'node', ['--import', 'tsx', 'src/server.ts'], { PORT: '4000', LOG_LEVEL: 'silent' });
  run(`${ROOT}/apps/web`, 'npx', ['vite', '--port', '5173', '--strictPort']);

  check('API is up', await waitFor('http://localhost:4000/api/v1/healthz'));
  check('web app is up', await waitFor(APP));

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const errors = [];
  const newPage = async (label) => {
    const context = await browser.newContext({ viewport: { width: 1480, height: 920 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`[${label}] ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Failed to load resource|WebSocket/i.test(m.text())) {
        errors.push(`[${label}] ${m.text()}`);
      }
    });
    return page;
  };

  // ---------------------------------------------------------------- sign in
  const ayesha = await newPage('ayesha');
  await ayesha.goto(`${APP}/login`);
  await ayesha.waitForSelector('form');
  check('login screen renders', await ayesha.isVisible('text=Welcome back'));
  await ayesha.screenshot({ path: `${SHOTS}/01-login.png` });

  await signIn(ayesha, 'ayesha@northwind.test');
  check('projects page lists the seeded projects', (await ayesha.locator('.project-card').count()) === 4);
  await ayesha.screenshot({ path: `${SHOTS}/02-projects.png` });

  await openProject(ayesha, 'Platform Core');
  const columnNames = await ayesha.locator('.column__title').allTextContents();
  check('board shows the four workflow columns',
    JSON.stringify(columnNames.slice(0, 4)) === JSON.stringify(['Backlog', 'In Progress', 'Code Review', 'Done']),
    columnNames.join(','));
  check('seeded cards are on the board', (await ayesha.locator('[data-testid=task-card]').count()) >= 10);
  check('websocket reports live', await ayesha.isVisible('.live-dot.is-live'));
  await ayesha.screenshot({ path: `${SHOTS}/03-board.png` });

  // ------------------------------------------------------- second live user
  const ali = await newPage('ali');
  await signIn(ali, 'ali@northwind.test');
  await openProject(ali, 'Platform Core');
  await sleep(1200);
  check('presence shows both viewers', (await ayesha.locator('.avatar-stack__item').count()) >= 2);

  // ------------------------------------------------------- live card create
  const title = `Live card ${Date.now()}`;
  await ayesha.locator('.column').first().locator('.column__add').click();
  await ayesha.locator('.column').first().locator('textarea').fill(title);
  await ayesha.locator('.column').first().locator('button:has-text("Add card")').click();
  await ayesha.waitForSelector(`[data-testid=task-card]:has-text("${title}")`, { timeout: 10000 });
  check('card appears for its author', true);

  await ali.waitForSelector(`[data-testid=task-card]:has-text("${title}")`, { timeout: 10000 })
    .then(() => check('the other user sees it live, with no refresh', true))
    .catch(() => check('the other user sees it live, with no refresh', false));
  await ali.screenshot({ path: `${SHOTS}/04-realtime-second-user.png` });

  // ------------------------------------------------------------ drag & drop
  const cardSelector = `[data-testid=task-card]:has-text("${title}")`;
  await dragCard(ayesha, cardSelector, 'In Progress');
  await sleep(1400);

  const landedColumn = await ayesha.evaluate((text) => {
    const card = [...document.querySelectorAll('[data-testid=task-card]')].find((el) => el.textContent?.includes(text));
    return card?.closest('.column')?.querySelector('.column__title')?.textContent ?? null;
  }, title);
  check('drag and drop moves the card to another column', landedColumn === 'In Progress', String(landedColumn));

  const mirroredColumn = await ali.evaluate((text) => {
    const card = [...document.querySelectorAll('[data-testid=task-card]')].find((el) => el.textContent?.includes(text));
    return card?.closest('.column')?.querySelector('.column__title')?.textContent ?? null;
  }, title);
  check('the move is mirrored to the other user live', mirroredColumn === 'In Progress', String(mirroredColumn));
  await ayesha.screenshot({ path: `${SHOTS}/05-after-drag.png` });

  // ------------------------------------------------------------ task drawer
  await ayesha.click('[data-testid=task-card]:has-text("Identity and access management")');
  await ayesha.waitForSelector('.drawer', { timeout: 10000 });
  check('task drawer opens', await ayesha.isVisible('.drawer__title'));
  await ayesha.click('.tabs__tab:has-text("Subtasks")');
  await ayesha.waitForSelector('.subtask-row', { timeout: 10000 });
  check('the subtask tree is visible', (await ayesha.locator('.subtask-row').count()) >= 1);
  await ayesha.screenshot({ path: `${SHOTS}/06-task-drawer-subtasks.png` });

  // ----------------------------------------------------- assignment + badge
  await ayesha.click('.tabs__tab:has-text("Discussion")');
  await ayesha.selectOption('.drawer__grid select >> nth=1', { label: 'Ali Raza' });
  await sleep(1500);
  const badge = await ali.locator('.bell__badge').count();
  check('assignment pushes a live notification badge to the assignee', badge > 0, `badge=${badge}`);

  // --------------------------------------------------------------- comments
  const remark = `Verified by the browser suite ${Date.now()}`;
  await ayesha.fill('.composer textarea', remark);
  await ayesha.click('.composer button:has-text("Send")');
  await ayesha.waitForSelector(`.comment:has-text("${remark}")`, { timeout: 10000 });
  check('comment posts into the thread', true);
  await ayesha.screenshot({ path: `${SHOTS}/07-task-discussion.png` });
  await ayesha.click('.drawer__head button[aria-label="Close card"]');

  // ------------------------------------------------------------- list view
  await ayesha.click('.seg button:has-text("List")');
  await ayesha.waitForSelector('.list-table tbody tr', { timeout: 10000 });
  check('list view renders the same data as a table', (await ayesha.locator('.list-table tbody tr').count()) >= 10);
  await ayesha.screenshot({ path: `${SHOTS}/08-list-view.png` });
  await ayesha.click('.seg button:has-text("Board")');

  // ---------------------------------------------------------------- filters
  await ayesha.fill('.toolbar .search input', 'refresh token');
  await sleep(900);
  const filteredTitles = await ayesha.locator('.task-card__title').allTextContents();
  // Two seeded cards mention refresh tokens, and both should survive the filter.
  check('filtering narrows the board to only the matching cards',
    filteredTitles.length === 2 && filteredTitles.every((t) => /refresh token/i.test(t)),
    JSON.stringify(filteredTitles));
  await ayesha.click('.toolbar button:has-text("Clear")');

  // ------------------------------------------------------------ permissions
  const hina = await newPage('hina');
  await signIn(hina, 'hina@northwind.test');
  await openProject(hina, 'Platform Core');
  check('a viewer sees the board', (await hina.locator('[data-testid=task-card]').count()) >= 10);
  check('a viewer gets no card composer', (await hina.locator('.column__add').count()) === 0);
  check('a viewer is told the board is read only', await hina.isVisible('.readonly-note'));
  await hina.screenshot({ path: `${SHOTS}/09-viewer-readonly.png` });

  // -------------------------------------------------------- activity + dark
  await ayesha.click('.board-head__right button:has-text("Activity")');
  await ayesha.waitForSelector('.rail');
  await ayesha.waitForSelector('.activity-row', { timeout: 10000 });
  check('activity rail shows the audit trail', (await ayesha.locator('.activity-row').count()) >= 3);
  await ayesha.screenshot({ path: `${SHOTS}/10-activity-rail.png` });
  await ayesha.click('.rail__head button');
  await sleep(400);

  await ayesha.click('.topbar button[aria-label^="Switch to"]');
  await sleep(500);
  check('dark theme applies', await ayesha.evaluate(() => document.documentElement.dataset.theme === 'dark'));
  await ayesha.screenshot({ path: `${SHOTS}/11-dark-board.png` });
  await ayesha.click('.topbar button[aria-label^="Switch to"]');

  // ------------------------------------------------------------- my work +
  await ali.goto(`${APP}/my-work`);
  await ali.waitForSelector('.page__title');
  await ali.waitForSelector('.work-row', { timeout: 10000 });
  check('my work lists assigned cards', (await ali.locator('.work-row').count()) >= 1);
  await ali.screenshot({ path: `${SHOTS}/12-my-work.png` });

  await ayesha.goto(`${APP}/members`);
  await ayesha.waitForSelector('.member-row');
  check('members page lists the whole workspace', (await ayesha.locator('.member-row').count()) === 5);
  await ayesha.screenshot({ path: `${SHOTS}/13-members.png` });

  check('no uncaught javascript errors in any page', errors.length === 0, errors.slice(0, 4).join(' | '));

  await browser.close();
};

main()
  .catch((error) => { console.error('\nUnexpected error:', error); fails.push(`unexpected: ${error.message}`); })
  .finally(async () => {
    procs.forEach((p) => { try { p.kill('SIGKILL'); } catch { /* gone */ } });
    await sleep(400);
    console.log(`\n  ${pass} passed, ${fails.length} failed`);
    fails.forEach((f) => console.log(`   - ${f}`));
    console.log(`  Screenshots: ${SHOTS}`);
    process.exit(fails.length ? 1 : 0);
  });
