import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

/**
 * Detects a database seeded from an older version of `seed.ts`.
 *
 * `npm run seed` refuses to touch a database that already has users, which is
 * correct — it must never silently destroy someone's work. But `npm run setup`
 * called it unconditionally, so anyone who had run the project before got the
 * message "Database already contains users — nothing to seed" buried in a long
 * install log, followed by "Setup complete". The result was a setup that
 * reported success while leaving the previous demo data in place.
 *
 * The fingerprint is a hash of `seed.ts` itself rather than a hand-maintained
 * version number, so changing the demo data is enough to invalidate an old
 * database. Nobody has to remember to bump anything.
 */
const SEED_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed.ts');

export const seedFingerprint = (): string => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(SEED_FILE)).digest('hex').slice(0, 12);
  } catch {
    // Running from a compiled build where the TypeScript source is absent.
    return 'unknown';
  }
};

/** Beside the database file, so deleting the database discards the stamp too. */
export const stampPath = (): string => path.join(path.dirname(env.databaseFile), '.seed-stamp');

export const readStamp = (): string | null => {
  try {
    return fs.readFileSync(stampPath(), 'utf8').trim();
  } catch {
    return null;
  }
};

export const writeStamp = (): void => {
  try {
    fs.writeFileSync(stampPath(), `${seedFingerprint()}\n`, 'utf8');
  } catch {
    // A stamp that cannot be written is not worth failing a seed over.
  }
};

/** True when the database was seeded from a different version of seed.ts. */
export const isStale = (): boolean => {
  const stamp = readStamp();
  return stamp === null || stamp !== seedFingerprint();
};
