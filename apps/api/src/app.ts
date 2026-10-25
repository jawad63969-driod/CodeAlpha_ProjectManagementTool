import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './auth/auth.routes.js';
import { organizationRouter } from './modules/organizations/organization.routes.js';
import { projectRouter } from './modules/projects/project.routes.js';
import { boardRouter } from './modules/boards/board.routes.js';
import { taskRouter } from './modules/tasks/task.routes.js';
import { attachmentRouter } from './modules/attachments/attachment.routes.js';
import { commentRouter } from './modules/comments/comment.routes.js';
import { notificationRouter } from './modules/notifications/notification.routes.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import './auth/context.js';

/**
 * Composition root. Everything is wired here and nowhere else, which is what
 * lets the test suite build an app instance without starting a server.
 */
export const createApp = (): Express => {
  const app = express();

  // Behind a reverse proxy in production, so rate limiting sees real client IPs.
  app.set('trust proxy', env.isProduction ? 1 : false);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: env.clientOrigins,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContext);

  app.use('/api/v1', healthRouter);
  app.use('/api/v1', authRouter);
  app.use('/api/v1', organizationRouter);
  app.use('/api/v1', projectRouter);
  app.use('/api/v1', boardRouter);
  app.use('/api/v1', taskRouter);
  app.use('/api/v1', attachmentRouter);
  app.use('/api/v1', commentRouter);
  app.use('/api/v1', notificationRouter);
  app.use('/api/v1', activityRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
