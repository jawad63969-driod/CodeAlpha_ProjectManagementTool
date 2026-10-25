import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, '../..');

dotenv.config({ path: path.join(APP_ROOT, '.env'), quiet: true });

/**
 * Configuration is validated once, at boot. A misconfigured process fails
 * immediately with a readable message rather than throwing at 3am on the first
 * request that happens to touch the missing value.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  DATABASE_URL: z.string().default('file:./data/taskforge.db'),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(200).default(25),

  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}

const raw = parsed.data;

/** `file:./data/x.db` and plain paths both resolve against the app root. */
const resolveDbFile = (url: string): string => {
  const withoutScheme = url.startsWith('file:') ? url.slice('file:'.length) : url;
  return path.resolve(APP_ROOT, withoutScheme);
};

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  databaseFile: resolveDbFile(raw.DATABASE_URL),
  storageDir: path.resolve(APP_ROOT, raw.STORAGE_DIR),
  clientOrigins: raw.CLIENT_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
} as const;

// A production deployment must never run on the sample secrets.
if (env.isProduction) {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (env[key].includes('change_me')) {
      throw new Error(`${key} still holds its development placeholder — refusing to start in production.`);
    }
  }
}
