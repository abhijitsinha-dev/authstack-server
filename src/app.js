import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { httpStream } from './config/logger.js';
import { swaggerJsonHandler, swaggerUiHandler } from './config/swagger.js';

// Route imports
import rootRoute from './routes/root.route.js';
import healthRoute from './routes/health.route.js';
import indexRoute from './routes/index.route.js';
import notFoundRoute from './routes/notFound.route.js';
import { errorHandler } from './middlewares/error.middleware.js';

const isProduction = process.env.NODE_ENV === 'production';
const app = express();

// Behind Vercel's proxy — needed for correct req.ip / req.protocol
app.set('trust proxy', 1);

// --- Security ---------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(
  cors({
    origin: isProduction ? '*' : true,
    credentials: true,
  })
);

// --- Body parsers -----------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// --- HTTP request logging ---------------------------------------------------
app.use(morgan(isProduction ? 'combined' : 'dev', { stream: httpStream }));

// --- API docs ---------------------------------------------------------------
app.get('/api-docs.json', swaggerJsonHandler);
app.get('/api-docs', swaggerUiHandler);

// --- Infrastructure Routes (UNVERSIONED) ------------------------------------
// Load balancers and monitors hit these directly.
app.use('/', rootRoute);
app.use('/health', healthRoute);

// --- Business API Routes (VERSIONED) ----------------------------------------
// All business logic lives under /api/v1 (e.g., /api/v1/auth/...)
app.use('/api/v1', indexRoute);

// --- 404 (JSON) -------------------------------------------------------------
// Catches anything that didn't match the routes above.
app.use(notFoundRoute);

// --- Centralized error handler ---------------------------------------------
app.use(errorHandler);

export default app;
