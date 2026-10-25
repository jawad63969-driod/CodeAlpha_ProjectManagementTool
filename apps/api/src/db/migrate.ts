import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { APP_ROOT } from '../config/env.js';
import { closeDatabase, db } from './client.js';

/** Applies every pending migration. Safe to run repeatedly. */
export const runMigrations = (): void => {
  migrate(db, { migrationsFolder: path.join(APP_ROOT, 'src/db/migrations') });
};

const isDirectRun = process.argv[1]?.includes('migrate');
if (isDirectRun) {
  runMigrations();
  console.log('Migrations applied.');
  closeDatabase();
}
