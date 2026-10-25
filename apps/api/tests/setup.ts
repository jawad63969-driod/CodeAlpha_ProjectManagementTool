import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll } from 'vitest';

/**
 * Every run starts from an empty database (NFR-18). The file is removed before
 * anything imports the client, so migrations run against a clean schema.
 */
const here = path.dirname(new URL(import.meta.url).pathname);
const appRoot = path.resolve(here, '..');
const dbFile = path.join(appRoot, 'data', 'test.db');
const storageDir = path.join(appRoot, 'data', 'test-storage');

const removeDatabase = (): void => {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
};

removeDatabase();
fs.rmSync(storageDir, { recursive: true, force: true });

beforeAll(async () => {
  const { runMigrations } = await import('../src/db/migrate.js');
  runMigrations();
});

afterAll(async () => {
  const { closeDatabase } = await import('../src/db/client.js');
  closeDatabase();
  removeDatabase();
  fs.rmSync(storageDir, { recursive: true, force: true });
});
