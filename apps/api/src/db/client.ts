import fs from 'node:fs';
import path from 'node:path';
import DatabaseConstructor, { type Database as SqliteDatabase } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { env } from '../config/env.js';
import * as schema from './schema.js';

fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });
fs.mkdirSync(env.storageDir, { recursive: true });

export const sqlite: SqliteDatabase = new DatabaseConstructor(env.databaseFile);

// WAL lets the REST layer read while the socket layer writes.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
// Wait rather than fail when another connection holds the write lock.
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
/** A transaction handle. Repositories accept `Executor` so they work inside or outside one. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export { schema };

export const closeDatabase = (): void => {
  try {
    sqlite.close();
  } catch {
    /* already closed */
  }
};
