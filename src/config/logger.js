import winston from 'winston';

const { combine, timestamp, printf, colorize, errors, splat, json } = winston.format;

// ─────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────
// Development format — human-readable, colored
// ─────────────────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${stack || message}${metaStr}`;
  })
);

// ─────────────────────────────────────────────
// Production format — structured JSON
// Vercel ingests JSON logs and exposes each field for filtering
// in the dashboard, so keep one log = one JSON object per line.
// ─────────────────────────────────────────────
const prodFormat = combine(timestamp(), errors({ stack: true }), splat(), json());

// ─────────────────────────────────────────────
// Logger instance
// ─────────────────────────────────────────────
export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: {
    service: 'authstack',
    env: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// ─────────────────────────────────────────────
// Morgan stream — pipes HTTP request logs through winston
// morgan calls stream.write(string); we forward to logger.http()
// ─────────────────────────────────────────────
export const httpStream = {
  write: (message) => logger.http(message.trim()),
};
