import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { httpStream } from './config/logger.js';
import { swaggerJsonHandler, swaggerUiHandler } from './config/swagger.js';

import indexRoute from './routes/index.route.js';
import notFoundRoute from './routes/notFound.route.js';
import { errorHandler } from './middlewares/error.middleware.js';

const isProduction = process.env.NODE_ENV === 'production';

const app = express();

// Behind Vercel's proxy — needed for correct req.ip / req.protocol
app.set('trust proxy', 1);

// --- Security ---------------------------------------------------------------
// Helmet with a CSP that permits the Swagger UI to load its assets from
// jsdelivr and to run the inline init script. The default helmet() CSP
// blocks external scripts + inline scripts, which is why /api-docs rendered
// blank even though the CDN was reachable.
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
    origin: isProduction ? '*' : true, // tighten in production once you have a frontend
    credentials: true,
  })
);

// --- Body parsers -----------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// --- HTTP request logging ---------------------------------------------------
app.use(morgan(isProduction ? 'combined' : 'dev', { stream: httpStream }));

// --- API docs ---------------------------------------------------------------
// Mount these BEFORE the 404 / error handlers so they are always reachable.
app.get('/api-docs.json', swaggerJsonHandler);
app.get('/api-docs', swaggerUiHandler);

// --- Application routes -----------------------------------------------------
app.use(indexRoute);

// --- 404 (JSON) -------------------------------------------------------------
// If index.route.js already mounts the 404 at the end, remove this line.
app.use(notFoundRoute);

// --- Centralized error handler ---------------------------------------------
app.use(errorHandler);

export default app;
