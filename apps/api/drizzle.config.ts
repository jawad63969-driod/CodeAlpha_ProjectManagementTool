import type { Config } from 'drizzle-kit';
import path from 'node:path';

const dbFile = (process.env.DATABASE_URL ?? 'file:./data/taskforge.db').replace(/^file:/, '');

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: path.resolve(process.cwd(), dbFile) },
  strict: true,
  verbose: false,
} satisfies Config;
