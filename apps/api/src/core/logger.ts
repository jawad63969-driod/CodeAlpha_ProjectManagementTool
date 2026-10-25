import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Structured JSON logging (NFR-13). Pretty output is deliberately NOT enabled —
 * development output stays in the same shape as production so a log line that
 * works in one works in the other.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'taskforge-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      '*.passwordHash',
      'refreshToken',
      '*.refreshToken',
      'accessToken',
      '*.accessToken',
    ],
    remove: true,
  },
});

export type Logger = typeof logger;
