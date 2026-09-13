import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { requestId, apiLimiter, errorHandler } from './middleware/common.js';
import { registerDefaults } from './providers/registry.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import moneyRoutes from './routes/money.js';
import platformRoutes from './routes/platform.js';
import opsRoutes from './routes/ops.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';

export function createApp() {
  registerDefaults();
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.frontendUrl.split(','), credentials: true }));
  app.use(express.json({
    limit: '256kb',
    // Keep the raw body for HMAC verification on signed webhook routes.
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  app.use(cookieParser());
  app.use(requestId);

  app.get('/health', (_req, res) => res.json({ success: true, service: 'naija-verify', ts: new Date().toISOString() }));

  app.use('/api/auth', authRoutes);
  app.use('/api', apiLimiter, catalogRoutes);
  app.use('/api', apiLimiter, moneyRoutes);
  app.use('/api', apiLimiter, platformRoutes);
  app.use('/api', apiLimiter, opsRoutes);
  app.use('/api', apiLimiter, adminRoutes);
  app.use('/api', apiLimiter, webhookRoutes);

  app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' }));
  app.use(errorHandler);
  return app;
}
