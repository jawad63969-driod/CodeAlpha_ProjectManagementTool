import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { closeDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createRealtimeGateway } from './realtime/gateway.js';

runMigrations();

const app = createApp();
const server = http.createServer(app);
const io = createRealtimeGateway(server);

server.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, database: env.databaseFile },
    'TaskForge API listening',
  );
  if (!env.isProduction) {
    console.log(`\n  TaskForge API`);
    console.log(`  REST      : http://localhost:${env.PORT}/api/v1`);
    console.log(`  Health    : http://localhost:${env.PORT}/api/v1/healthz`);
    console.log(`  Websocket : ws://localhost:${env.PORT}/socket.io`);
    console.log(`  Database  : ${env.databaseFile}\n`);
  }
});

/** Drain in-flight work before exiting (NFR-10). */
const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutting down');
  io.close(() => {
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server };
