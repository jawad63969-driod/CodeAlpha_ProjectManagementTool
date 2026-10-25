/**
 * Capture the screenshots used by the README and the docs.
 *
 * Separate from qa/e2e.mjs on purpose. The E2E suite creates cards in order to
 * prove the realtime path works, and those cards are named after a timestamp.
 * Shooting the gallery from the same run is how `Live card 1790082655320`
 * ended up in screenshots committed to the repository.
 *
 * This script reseeds first and mutates nothing, so what it captures is the
 * demo workspace exactly as a reviewer will meet it.
 *
 *   npm run shots
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('playwright is not installed.\n  npm install --save-dev playwright\n  npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const APP = 'http://localhost:5173';
const VIEWPORT = { width: 1680, height: 960 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];

const run = (cwd, cmd, args, env = {}) => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  procs.push(child);
  return child;
};

const waitFor = async (url, tries = 90) => {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
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
  await sleep(500);
};

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('Reseeding the demo workspace…');
  spawnSync('npm', ['run', 'reset', '-w', '@taskforge/api'], { cwd: ROOT, stdio: 'ignore' });

  run(path.join(ROOT, 'apps/api'), 'node', ['--import', 'tsx', 'src/server.ts'], { PORT: '4000', LOG_LEVEL: 'silent' });
  run(path.join(ROOT, 'apps/web'), 'npx', ['vite', '--port', '5173', '--strictPort']);

  if (!(await waitFor('http://localhost:4000/health'))) throw new Error('API did not start');
  if (!(await waitFor(APP))) throw new Error('web app did not start');

  const browser = await chromium.launch();
  const shot = async (page, name) => {
    await page.screenshot({ path: path.join(OUT, name) });
    console.log(`  ${name}`);
  };
  const newPage = async () => (await browser.newContext({ viewport: VIEWPORT })).newPage();

  // ---------------------------------------------------------------- signed out
  const guest = await newPage();
  await guest.goto(`${APP}/login`);
  await guest.waitForSelector('form');
  await shot(guest, '01-login.png');

  // ------------------------------------------------------------------- owner
  const ayesha = await newPage();
  await signIn(ayesha, 'ayesha@northwind.test');
  await shot(ayesha, '02-projects.png');

  await openProject(ayesha, 'Platform Core');
  await shot(ayesha, '03-board.png');

  // A second person on the same board, so presence is real in the shot.
  const ali = await newPage();
  await signIn(ali, 'ali@northwind.test');
  await openProject(ali, 'Platform Core');
  await sleep(1200);
  await ayesha.reload();
  await ayesha.waitForSelector('.live-dot.is-live');
  await sleep(1200);
  await shot(ayesha, '04-presence.png');

  // ------------------------------------------------------------------ drawer
  await ayesha.click('[data-testid=task-card]:has-text("Identity and access management")');
  await ayesha.waitForSelector('.drawer');
  await sleep(600);
  await shot(ayesha, '05-task-drawer.png');

  await ayesha.click('.tabs__tab:has-text("Subtasks")');
  await sleep(700);
  await shot(ayesha, '06-task-subtasks.png');

  await ayesha.click('.tabs__tab:has-text("Discussion")');
  await sleep(700);
  await ayesha.click('.drawer__head button[aria-label="Close card"]');

  await ayesha.click('[data-testid=task-card]:has-text("Drag and drop with a keyboard alternative")');
  await ayesha.waitForSelector('.drawer');
  await sleep(800);
  await shot(ayesha, '07-task-discussion.png');
  await ayesha.click('.drawer__head button[aria-label="Close card"]');

  // -------------------------------------------------------------- list + rail
  await ayesha.click('.seg button:has-text("List")');
  await ayesha.waitForSelector('.list-table');
  await sleep(500);
  await shot(ayesha, '08-list-view.png');
  await ayesha.click('.seg button:has-text("Board")');
  await sleep(400);

  await ayesha.click('.board-head__right button:has-text("Activity")');
  await ayesha.waitForSelector('.rail');
  await sleep(900);
  await shot(ayesha, '09-activity-rail.png');
  await ayesha.click('.rail__head button');
  await sleep(400);

  // --------------------------------------------------------------- dark theme
  await ayesha.click('.topbar button[aria-label^="Switch to"]');
  await sleep(700);
  await shot(ayesha, '10-dark-board.png');
  await ayesha.click('.topbar button[aria-label^="Switch to"]');
  await sleep(500);

  // ------------------------------------------------------------- viewer, RBAC
  const hina = await newPage();
  await signIn(hina, 'hina@northwind.test');
  await openProject(hina, 'Platform Core');
  await sleep(600);
  await shot(hina, '11-viewer-readonly.png');

  // ------------------------------------------------------------ my work, org
  await ali.goto(`${APP}/my-work`);
  await ali.waitForSelector('.page__title');
  await sleep(700);
  await shot(ali, '12-my-work.png');

  await ayesha.goto(`${APP}/members`);
  await ayesha.waitForSelector('.member-row');
  await sleep(600);
  await shot(ayesha, '13-members.png');

  // ----------------------------------------------------------------- narrow
  const phone = await (await browser.newContext({ viewport: { width: 430, height: 880 } })).newPage();
  await signIn(phone, 'ayesha@northwind.test');
  await openProject(phone, 'Platform Core');
  await sleep(800);
  await shot(phone, '14-narrow-board.png');

  await browser.close();
  console.log(`\nScreenshots written to ${OUT}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of procs) child.kill('SIGKILL');
    setTimeout(() => process.exit(process.exitCode ?? 0), 300);
  });
