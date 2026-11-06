import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { httpStream } from './config/logger.js';
import swaggerSpec from './config/swagger.js';
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
// API Documentation — served in all environments
// CSP is disabled for this route only so Swagger UI can render.
// Assets are loaded from a CDN because Vercel's serverless runtime
// does not serve the local node_modules/swagger-ui-dist files reliably.
// ─────────────────────────────────────────────
app.use(
  '/api-docs',
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
    ],
  })
);

// ─────────────────────────────────────────────
// Raw OpenAPI spec — useful for tooling and code generation
// ─────────────────────────────────────────────
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// ─────────────────────────────────────────────
// Routes — all routers mounted via the aggregator.
// This must come AFTER Swagger UI so /api-docs
// is claimed before the 404 catch-all fires.
// ─────────────────────────────────────────────
app.use(indexRoute);

// ─────────────────────────────────────────────
// Error handler (must be last)
// ─────────────────────────────────────────────
app.use(errorHandler);

export default app;
