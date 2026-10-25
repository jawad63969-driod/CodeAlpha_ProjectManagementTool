/**
 * Starts every workspace with prefixed output.
 * Zero dependencies — identical behaviour on Windows, macOS and Linux.
 *
 * The port check below exists because of a real failure: a dev server left
 * running from an earlier session kept answering http://localhost:5173 while a
 * newly started one moved to 5174. The browser showed the old bundle talking to
 * the old API, so new code and freshly seeded data both appeared to have no
 * effect. Nothing in the output said so. Now it refuses to start and says
 * exactly what is holding the port.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const COLORS = { shared: '\x1b[33m', api: '\x1b[36m', web: '\x1b[35m', reset: '\x1b[0m' };
const DIM = '\x1b[2m';
const RED = '\x1b[31m';

const portFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });

const preflight = async () => {
  const wanted = [
    { port: 4000, what: 'the API' },
    { port: 5173, what: 'the web app' },
  ];
  const taken = [];
  for (const entry of wanted) {
    if (!(await portFree(entry.port))) taken.push(entry);
  }
  if (taken.length === 0) return;

  console.error(`\n${RED}Cannot start: ${taken.map((t) => t.port).join(' and ')} already in use.${COLORS.reset}\n`);
  for (const entry of taken) {
    console.error(`  Port ${entry.port} (${entry.what}) is held by another process.`);
  }
  console.error(`\n  This is almost always a dev server still running from an earlier session.`);
  console.error(`  Close that terminal, or stop the process:\n`);
  if (isWindows) {
    console.error(`${DIM}    netstat -ano | findstr :${taken[0].port}`);
    console.error(`    taskkill /PID <pid> /F${COLORS.reset}\n`);
  } else {
    console.error(`${DIM}    lsof -ti:${taken[0].port} | xargs kill${COLORS.reset}\n`);
  }
  console.error(`  Starting anyway would serve the old code at the address you have open.\n`);
  process.exit(1);
};

const start = (label, workspace) => {
  const child = spawn('npm', ['run', 'dev', '-w', workspace], {
    cwd: root,
    shell: isWindows,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pipe = (stream) => (data) =>
    String(data)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => stream.write(`${COLORS[label]}[${label}]${COLORS.reset} ${line}\n`));
  child.stdout.on('data', pipe(process.stdout));
  child.stderr.on('data', pipe(process.stderr));
  child.on('exit', (code) => {
    process.stdout.write(`${COLORS[label]}[${label}]${COLORS.reset} exited (${code})\n`);
    // A server that dies on startup must not be lost in the other two's output.
    if (code !== 0 && code !== null) {
      console.error(`\n${RED}[${label}] failed to start — stopping everything.${COLORS.reset}\n`);
      shutdown(1);
    }
  });
  return child;
};

const children = [];

const shutdown = (code = 0) => {
  children.forEach((c) => {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  });
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

await preflight();

children.push(start('shared', '@taskforge/shared'), start('api', '@taskforge/api'));
if (fs.existsSync(path.join(root, 'apps/web/index.html'))) {
  children.push(start('web', '@taskforge/web'));
}

console.log(`\n${DIM}  API  http://localhost:4000     Web  http://localhost:5173${COLORS.reset}\n`);
