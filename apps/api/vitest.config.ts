import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // One SQLite file per run, so suites must not race each other.
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./data/test.db',
      STORAGE_DIR: './data/test-storage',
      JWT_ACCESS_SECRET: 'test_access_secret_at_least_32_characters_long',
      JWT_REFRESH_SECRET: 'test_refresh_secret_at_least_32_characters_long',
      LOG_LEVEL: 'silent',
      BCRYPT_ROUNDS: '10',
    },
  },
});
