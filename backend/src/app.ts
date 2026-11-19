import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config, isTest } from './config';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { openapi } from './openapi';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { catalogRouter } from './routes/catalog';
import { subscriptionsRouter } from './routes/subscriptions';
import { userRouter } from './routes/user';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '12mb' }));

  if (!isTest) {
    app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Забагато запитів. Спробуйте пізніше' } } }));
    app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Забагато запитів. Спробуйте пізніше' } } }));
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', catalogRouter);
  app.use('/api', subscriptionsRouter);
  app.use('/api', userRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
