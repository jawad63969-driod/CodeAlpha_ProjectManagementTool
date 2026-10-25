/**
 * One-command setup: install, create .env files, build the shared contracts,
 * apply migrations and seed demo data.
 *
 * Setup guarantees a known-good demo workspace. It used to call `npm run seed`
 * unconditionally, and seed refuses to touch a database that already has users
 * — so on a second run it printed "nothing to seed" into the middle of a long
 * install log and then "Setup complete", leaving the previous demo data in
 * place. Anyone who had run the project before got a setup that reported
 * success and changed nothing.
 *
 *   npm run setup                 reseed if the demo data is out of date
 *   npm run setup -- --keep-data  never touch the database
 *   npm run setup -- --fresh      always wipe and reseed
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const KEEP_DATA = process.argv.includes('--keep-data');
const FRESH = process.argv.includes('--fresh');

const step = (message) => console.log(`\n→ ${message}`);
const note = (message) => console.log(`  ${message}`);

const run = (args, cwd = root) => {
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) {
    console.error(`\nFailed: npm ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
};

const ensureEnv = (dir) => {
  const example = path.join(dir, '.env.example');
  const target = path.join(dir, '.env');
  if (fs.existsSync(example) && !fs.existsSync(target)) {
    fs.copyFileSync(example, target);
    note(`created ${path.relative(root, target)}`);
  }
};

/** Mirrors apps/api/src/db/seedStamp.ts — a hash of seed.ts, not a version number. */
const SEED_FILE = path.join(root, 'apps/api/src/db/seed.ts');
const DATA_DIR = path.join(root, 'apps/api/data');
const STAMP_FILE = path.join(DATA_DIR, '.seed-stamp');

const seedFingerprint = () => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(SEED_FILE)).digest('hex').slice(0, 12);
  } catch {
    return null;
  }
};

const readStamp = () => {
  try {
    return fs.readFileSync(STAMP_FILE, 'utf8').trim();
  } catch {
    return null;
  }
};

/**
 * Whether a database existed BEFORE this run. It has to be sampled up front:
 * the migration step creates the file, so checking later cannot tell a fresh
 * clone apart from a database left over from an older seed.
 */
const hadDatabase = fs.existsSync(path.join(DATA_DIR, 'taskforge.db'));

/**
 * Vite caches transformed dependencies. Replacing source files underneath a
 * cache it believes is current is a reliable way to be served yesterday's CSS.
 */
const clearViteCache = () => {
  const caches = [
    path.join(root, 'apps/web/node_modules/.vite'),
    path.join(root, 'node_modules/.vite'),
  ];
  let cleared = 0;
  for (const dir of caches) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      cleared += 1;
    }
  }
  if (cleared > 0) note(`cleared ${cleared} Vite cache director${cleared === 1 ? 'y' : 'ies'}`);
};

step('Installing workspace dependencies');
run(['install', '--no-audit', '--no-fund']);

step('Creating .env files');
ensureEnv(path.join(root, 'apps/api'));
ensureEnv(path.join(root, 'apps/web'));

step('Clearing build caches');
clearViteCache();

step('Building shared contracts');
run(['run', 'build', '-w', '@taskforge/shared']);

step('Applying database migrations');
run(['run', 'db:migrate', '-w', '@taskforge/api']);

if (fs.existsSync(SEED_FILE)) {
  const fingerprint = seedFingerprint();
  const stamp = readStamp();
  const stale = hadDatabase && stamp !== fingerprint;

  if (KEEP_DATA) {
    step('Skipping the demo data (--keep-data)');
    if (stale) note('note: the database predates the current demo data.');
  } else if (stale) {
    step('Demo data is out of date — reseeding');
    note('the local database was seeded from an older version of the demo data.');
    note('it will be wiped and rebuilt. Use --keep-data to leave it alone.');
    run(['run', 'reset', '-w', '@taskforge/api']);
  } else if (FRESH) {
    step('Reseeding the demo workspace (--fresh)');
    run(['run', 'reset', '-w', '@taskforge/api']);
  } else {
    step(hadDatabase ? 'Checking the demo data' : 'Seeding demo data');
    run(['run', 'seed', '-w', '@taskforge/api']);
  }
}

console.log('\nSetup complete. Start everything with:  npm run dev\n');
