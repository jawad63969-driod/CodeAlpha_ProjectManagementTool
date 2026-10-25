/**
 * P1-2 verification: a failed query must never be rendered as a successful
 * empty result.
 *
 *   npm run test:error-states
 *
 * For each of the six screens the audit confirmed, this boots the real stack,
 * signs in as a real seeded user, then makes exactly one API call fail and
 * asserts two things:
 *
 *   1. the screen shows an error with a retry control, and
 *   2. the reassuring empty-state sentence is NOT on the page.
 *
 * The second assertion is the point. Before this change every one of these
 * screens answered a dropped request with "No projects yet" / "All caught up" /
 * "Nothing on your plate" — a confident statement about the user's data that
 * happened to be false.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
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
const APP = 'http://localhost:5173';
const SHOTS = path.join(ROOT, 'qa', 'shots');

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

/**
 * Fail every request whose URL matches, until the returned function is called.
 * A 503 with a JSON body is what a real outage looks like to the client, so the
 * message the screen prints is the one the user would actually see.
 */
const breakRoute = async (page, match) => {
  // A glob is matched against the whole URL including the query string, which
  // silently failed to match `/projects?archived=false`. A predicate on the
  // pathname is unambiguous.
  const pattern = typeof match === 'string' ? (url) => url.pathname === match : match;
  const handler = async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'The server is unreachable' } }),
    });
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
};

/**
 * The query client retries a 5xx twice with backoff before it settles on an
 * error, so an error state is several seconds away, not milliseconds. Waiting
 * on the element rather than on a sleep is what makes this deterministic —
 * a fixed sleep made four of these checks fail against working code.
 */
const settle = async (page, selector, timeout = 20000) => {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
};

const signIn = async (page, email) => {
  await page.goto(`${APP}/login`);
  await page.waitForSelector('form');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'Password123!');
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('.project-card', { timeout: 20000 });
};

const main = async () => {
  run(`${ROOT}/apps/api`, 'node', ['--import', 'tsx', 'src/server.ts'], { PORT: '4000', LOG_LEVEL: 'silent' });
  run(`${ROOT}/apps/web`, 'npx', ['vite', '--port', '5173', '--strictPort']);

  check('API is up', await waitFor('http://localhost:4000/api/v1/healthz'));
  check('web app is up', await waitFor(APP));

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1480, height: 920 } });
  const page = await context.newPage();

  // -------------------------------------------------- 1. ProjectsPage
  await signIn(page, 'ayesha@northwind.test');

  const healProjects = await breakRoute(page, '/api/v1/projects');
  await page.reload();
  await page.waitForSelector('.empty--error', { timeout: 15000 }).catch(() => {});
  const projectsBody = await page.locator('body').innerText();
  check('ProjectsPage — shows an error, not an empty workspace',
    /Could not load your projects/.test(projectsBody));
  check('ProjectsPage — does NOT claim "No projects yet"',
    !/No projects yet/.test(projectsBody));
  check('ProjectsPage — offers a retry', await page.isVisible('.empty--error button:has-text("Try again")'));
  await page.screenshot({ path: `${SHOTS}/e01-projects-error.png` });

  // The retry must actually recover once the API is reachable again.
  await healProjects();
  await page.click('.empty--error button:has-text("Try again")');
  await page.waitForSelector('.project-card', { timeout: 15000 });
  check('ProjectsPage — retry recovers without a full reload',
    (await page.locator('.project-card').count()) > 0);

  // -------------------------------------------------- 2. AppShell sidebar
  const healSidebar = await breakRoute(page, '/api/v1/projects');
  await page.reload();
  await page.waitForSelector('.sidebar .error-line', { timeout: 15000 }).catch(() => {});
  check('AppShell sidebar — says the project list failed',
    await page.isVisible('.sidebar .error-line:has-text("Could not load projects")'));
  const sidebarCount = await page.locator('.sidebar__count').count();
  check('AppShell sidebar — does NOT show a project count of 0', sidebarCount === 0);
  await healSidebar();

  // -------------------------------------------------- 3. AppShell workspace menu
  const healWorkspaces = await breakRoute(page, '/api/v1/auth/workspaces');
  await page.reload();
  await page.waitForSelector('.project-card', { timeout: 20000 });
  await page.click('.menu__trigger');
  await page.waitForSelector('.dropdown', { timeout: 10000 });
  check('WorkspaceMenu — says the workspace list failed',
    await settle(page, '.dropdown .error-line:has-text("Could not load your workspaces")'));
  await page.keyboard.press('Escape');
  await page.click('body', { position: { x: 5, y: 400 } });
  await healWorkspaces();

  // -------------------------------------------------- 4. NotificationBell
  const healNotifs = await breakRoute(page, '/api/v1/notifications');
  await page.reload();
  await page.waitForSelector('.project-card', { timeout: 20000 });
  await page.click('button[aria-label^="Notifications"]');
  await page.waitForSelector('.notif-list', { timeout: 10000 });
  await settle(page, '.notif-list .empty--error');
  const notifBody = await page.locator('.notif-list').innerText();
  check('NotificationBell — shows an error', /Could not load your notifications/.test(notifBody));
  check('NotificationBell — does NOT claim "All caught up"', !/All caught up/.test(notifBody));
  check('NotificationBell — offers a retry', await page.isVisible('.notif-list button:has-text("Try again")'));
  await page.screenshot({ path: `${SHOTS}/e02-notifications-error.png` });
  await page.keyboard.press('Escape');
  await healNotifs();

  // -------------------------------------------------- 5. MyWorkPage
  const healMine = await breakRoute(page, '/api/v1/tasks/mine');
  await page.goto(`${APP}/my-work`);
  await page.waitForSelector('.empty--error', { timeout: 15000 }).catch(() => {});
  const mineBody = await page.locator('body').innerText();
  check('MyWorkPage — shows an error', /Could not load your work/.test(mineBody));
  check('MyWorkPage — does NOT claim "Nothing on your plate"', !/Nothing on your plate/.test(mineBody));
  check('MyWorkPage — offers a retry', await page.isVisible('.empty--error button:has-text("Try again")'));
  await page.screenshot({ path: `${SHOTS}/e03-mywork-error.png` });
  await healMine();

  // -------------------------------------------------- 6 & 7. Task drawer
  await page.goto(APP);
  await page.waitForSelector('.project-card', { timeout: 20000 });
  await page.click('.project-card:has-text("Platform Core")');
  await page.waitForSelector('.task-card', { timeout: 20000 });

  const healComments = await breakRoute(page, ((url) => /^\/api\/v1\/tasks\/[^/]+\/comments$/.test(url.pathname)));
  const healFiles = await breakRoute(page, ((url) => /^\/api\/v1\/tasks\/[^/]+\/attachments$/.test(url.pathname)));
  await page.click('.task-card');
  await page.waitForSelector('.drawer', { timeout: 15000 });
  await settle(page, '.drawer .empty--error');
  const drawerBody = await page.locator('.drawer').innerText();
  check('CommentThread — shows an error', /Could not load the discussion/.test(drawerBody));
  check('CommentThread — does NOT claim "No discussion yet"', !/No discussion yet/.test(drawerBody));
  await page.screenshot({ path: `${SHOTS}/e04-drawer-error.png` });

  // The attachments panel lives behind its own tab.
  const filesTab = page.locator('.tabs__tab:has-text("Files")');
  if (await filesTab.count()) {
    await filesTab.first().click();
    await settle(page, '.drawer .empty--error');
    const filesBody = await page.locator('.drawer').innerText();
    check('AttachmentsPanel — shows an error', /Could not load the files on this card/.test(filesBody));
    check('AttachmentsPanel — does NOT claim "Nothing attached yet"', !/Nothing attached yet/.test(filesBody));
    await page.screenshot({ path: `${SHOTS}/e05-files-error.png` });
  } else {
    check('AttachmentsPanel — Files tab is reachable', false, '(tab not found)');
  }
  await healComments();
  await healFiles();

  // -------------------------------------------------- control: healthy is still healthy
  await page.goto(APP);
  await page.waitForSelector('.project-card', { timeout: 20000 });
  const healthy = await page.locator('body').innerText();
  check('control — a healthy load shows no error state', !/Could not load/.test(healthy));
  check('control — a healthy load lists projects', (await page.locator('.project-card').count()) > 0);

  await browser.close();

  console.log(`\n  ${pass} passed, ${fails.length} failed`);
  if (fails.length) { fails.forEach((f) => console.log(`   - ${f}`)); }
  for (const child of procs) child.kill('SIGTERM');
  process.exit(fails.length ? 1 : 0);
};

main().catch(async (error) => {
  console.error(error);
  for (const child of procs) child.kill('SIGTERM');
  process.exit(1);
});
