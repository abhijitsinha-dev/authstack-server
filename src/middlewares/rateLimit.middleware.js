import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../config/rateLimiter.js';
import { logger } from '../config/logger.js';

/**
 * Factory function to create a rate limiting middleware.
 *
 * @param {Object} options
 * @param {number} options.limit - Max number of requests allowed
 * @param {string} options.window - Time window (e.g., '1 m', '15 m', '1 h')
 * @param {string} options.prefix - Unique prefix to prevent key collisions in Redis
 */
export const rateLimit = ({ limit, window, prefix }) => {
  // Create the limiter instance once when the route is initialized
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix,
  });

  // Return the actual Express middleware
  return async (req, res, next) => {
    const identifier = req.ip;

    try {
      const { success, limit: maxLimit, remaining, reset } = await limiter.limit(identifier);

      // Set standard rate limit headers for the client
      res.setHeader('X-RateLimit-Limit', maxLimit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);

      if (!success) {
        logger.warn(`Rate limit exceeded for IP: ${identifier}`, { prefix });
        return res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error', { error: error.message });
      // Fail open: if the rate limiter itself fails, allow the request to proceed
      next();
    }
  };
};
