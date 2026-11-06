import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { httpStream } from './config/logger.js';
import indexRoute from './routes/index.route.js';
import { errorHandler } from './middlewares/error.middleware.js';

const isProduction = process.env.NODE_ENV === 'production';
const app = express();

// Needed on Vercel for correct client IP + secure cookies behind the proxy
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// Security & parsing
// ─────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: '*',
    credentials: false,
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// ─────────────────────────────────────────────
// HTTP logging → winston
// 'combined' in prod (structured, parseable), 'dev' in dev (colored one-liners)
// ─────────────────────────────────────────────
app.use(
  morgan(isProduction ? 'combined' : 'dev', {
    stream: httpStream,
  })
);

// ─────────────────────────────────────────────
// Routes — all routers mounted inside index.route.js
// ─────────────────────────────────────────────
app.use(indexRoute);

// ─────────────────────────────────────────────
// Error handler (must be last)
// ─────────────────────────────────────────────
app.use(errorHandler);

export default app;
