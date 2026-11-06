// worker/index.js
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { sendSignupOtpEmail } from '../src/services/email.service.js';
import { connectDB } from '../src/config/db.js';
import { logger } from '../src/config/logger.js';

// 1. Connect to MongoDB (in case future worker jobs need database access)
await connectDB();

// 2. Create the Redis connection instance
const redisConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  keepAlive: 10000,
  tls: { rejectUnauthorized: false },
});

redisConnection.on('error', (err) => {
  logger.error('Worker Redis Connection Error', { error: err.message });
});

// 3. Initialize the BullMQ Worker with auto-cleanup rules
const worker = new Worker(
  'email-queue',
  async (job) => {
    logger.info(`Processing job ${job.id} of type ${job.name}`);
    if (job.name === 'send-otp') {
      const { email, name, otp } = job.data;
      await sendSignupOtpEmail(email, name, otp);
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
    limiter: {
      max: 10,
      duration: 1000,
    },
    // 👇 The key change: remove ALL finalized jobs immediately
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 },
  }
);

// 4. Event Listeners for logging
worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed`, { error: err.message });
});

logger.info('Worker started and listening for jobs...');

// 5. Graceful shutdown
const shutdown = async (signal) => {
  logger.warn(`Received ${signal}, shutting down worker gracefully...`);
  try {
    await worker.close();
    await redisConnection.quit();
    logger.info('Worker shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during worker shutdown', { error: err.message });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
