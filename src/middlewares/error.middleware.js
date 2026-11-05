import { logger } from '../config/logger.js';

export const errorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;

  if (status >= 500) {
    logger.error(err.message, { stack: err.stack });
  } else {
    logger.warn(`[${status}] ${err.message}`);
  }

  res.status(status).json({
    success: false,
    message:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
};
