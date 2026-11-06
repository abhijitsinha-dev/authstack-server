import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '../config/logger.js';

// 1. Create the Redis connection
const redisConnection = new IORedis(process.env.REDIS_URL, {
  // Required by BullMQ for blocking commands
  maxRetriesPerRequest: null,
  // Sends a TCP keepalive probe every 10 seconds to prevent idle disconnects (ECONNRESET)
  keepAlive: 10000,
  // Ensures TLS is used (fixes the ECONNRESET error with Upstash)
  tls: {
    rejectUnauthorized: false,
  },
});

// 2. Event listeners for Redis connection status
redisConnection.on('connect', () => {
  logger.info('Redis Queue: Connecting...');
});

redisConnection.on('ready', () => {
  logger.info('Redis Queue: Ready to accept commands');
});

redisConnection.on('error', (err) => {
  logger.error('Redis Queue Connection Error', { error: err.message });
});

redisConnection.on('close', () => {
  logger.warn('Redis Queue: Connection closed');
});

// 3. Initialize the Queue with auto-cleanup rules
export const emailQueue = new Queue('email-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    // Delete successful jobs immediately to save Upstash storage
    removeOnComplete: true,

    // Keep failed jobs for 24 hours (or max 500) for debugging
    removeOnFail: { age: 24 * 3600, count: 500 },

    // (Optional) Retry failed jobs automatically
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});
