/**
 * Measure how much of the viewport the content actually occupies, at the
 * widths people really use. Screenshots at one size hide this: a layout that
 * looks balanced at 1440 can be stranded in the left third at 2560.
 *
 *   node qa/widths.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'qa', 'widths');
const APP = 'http://localhost:5173';
const WIDTHS = [1366, 1600, 1920, 2560];

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
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* retry */ }
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

/** Rightmost painted pixel of any element inside `root`, as a share of the viewport. */
const contentRight = (page, rootSelector) =>
  page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return null;
    let right = 0;
    for (const el of root.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) right = Math.max(right, rect.right);
    }
    return { right: Math.round(right), viewport: window.innerWidth };
  }, rootSelector);

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  spawnSync('npm', ['run', 'reset', '-w', '@taskforge/api'], { cwd: ROOT, stdio: 'ignore' });
  run(path.join(ROOT, 'apps/api'), 'node', ['--import', 'tsx', 'src/server.ts'], { PORT: '4000', LOG_LEVEL: 'silent' });
  run(path.join(ROOT, 'apps/web'), 'npx', ['vite', '--port', '5173', '--strictPort']);
  if (!(await waitFor('http://localhost:4000/health'))) throw new Error('API did not start');
  if (!(await waitFor(APP))) throw new Error('web did not start');

  const browser = await chromium.launch();
  const rows = [];

  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await signIn(page, 'ayesha@northwind.test');
    await sleep(600);

    const projects = await contentRight(page, '.page');
    await page.screenshot({ path: path.join(OUT, `${width}-projects.png`) });

    await page.click('.project-card:has-text("Platform Core")');
    await page.waitForSelector('.column');
    await sleep(900);
    const board = await contentRight(page, '.board');
    await page.screenshot({ path: path.join(OUT, `${width}-board.png`) });

    await page.click('.seg button:has-text("List")');
    await page.waitForSelector('.list-table');
    await sleep(500);
    const list = await contentRight(page, '.list-view');
    await page.screenshot({ path: path.join(OUT, `${width}-list.png`) });

    rows.push({ width, projects, board, list });
    await context.close();
  }

  const pct = (m) => (m ? `${Math.round((m.right / m.viewport) * 100)}%` : '—');
  console.log('\n  viewport   projects     board        list        (share of width used)');
  for (const r of rows) {
    console.log(
      `  ${String(r.width).padEnd(10)} ${pct(r.projects).padEnd(12)} ${pct(r.board).padEnd(12)} ${pct(r.list)}`,
    );
  }
  console.log(`\n  Screenshots: ${OUT}`);
  await browser.close();
};

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => {
    for (const c of procs) c.kill('SIGKILL');
    setTimeout(() => process.exit(process.exitCode ?? 0), 300);
  });
