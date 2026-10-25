import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client.js';

export const healthRouter = Router();

/** Liveness: the process is up. Never touches the database. */
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'taskforge-api', uptimeSeconds: Math.floor(process.uptime()) });
});

/** Readiness: the process can actually serve traffic (NFR-14). */
healthRouter.get('/readyz', (_req, res) => {
  try {
    db.get(sql`select 1 as ok`);
    res.json({ status: 'ready', database: 'reachable' });
  } catch (error) {
    res.status(503).json({
      status: 'not-ready',
      database: 'unreachable',
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
});
