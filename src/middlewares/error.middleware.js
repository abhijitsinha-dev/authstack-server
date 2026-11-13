import { logger } from '../config/logger.js';

/**
 * Translate a Mongoose error into an HTTP-shaped response.
 *
 * Returns `null` for errors it doesn't recognize — the caller falls back to
 * `err.status` (set by ApiError) or 500. Extracted from the handler so the
 * mapping logic can be unit-tested without mocking Express.
 */
const mapMongooseError = (err) => {
  if (err.name === 'ValidationError') {
    // Model-level validation (e.g., password strength enforced by the schema
    // hook). Typically reached only when Joi validation is bypassed — a
    // defense-in-depth layer, not the primary check.
    const firstError = Object.values(err.errors || {})[0];
    return {
      status: 400,
      message: firstError?.message || 'Validation failed',
      logMeta: { fields: Object.keys(err.errors || {}) },
    };
  }

  if (err.code === 11000) {
    // Unique index violation (e.g., concurrent signup race on email).
    // The raw message includes the index name AND the offending value
    // (email) — never return that to the client.
    const field = Object.keys(err.keyPattern || {})[0];
    return {
      status: 409,
      message:
        field === 'email'
          ? 'An account with this email already exists. Please log in.'
          : 'A record with these details already exists.',
      logMeta: { duplicateKey: err.keyValue },
    };
  }

  if (err.name === 'CastError') {
    // Invalid type coercion — e.g., a crafted access token whose `sid`
    // claim is not a valid ObjectId, causing Session.findById() to throw.
    return {
      status: 400,
      message: 'Invalid request.',
      logMeta: { castPath: err.path, castKind: err.kind },
    };
  }

  return null;
};

export const errorHandler = (err, _req, res, _next) => {
  // Explicit ApiError (has .status): skip mapping, use as-is.
  // Unrecognized error: mapping returns null, fall back to 500.
  const mapped = err.status ? null : mapMongooseError(err);

  const status = mapped?.status ?? err.status ?? 500;
  const message = mapped?.message ?? err.message;
  const logMeta = mapped?.logMeta ?? {};

  if (status >= 500) {
    logger.error(err.message, { stack: err.stack, ...logMeta });
  } else {
    logger.warn(`[${status}] ${err.message}`, logMeta);
  }

  // In production, mask 5xx messages to prevent leaking internal details.
  // 4xx messages are intentional and safe to return.
  const responseMessage =
    status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : message;

  res.status(status).json({
    success: false,
    message: responseMessage,
  });
};
