import IORedis from 'ioredis';
import readline from 'readline';
import { logger } from '../src/config/logger.js';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  logger.error('❌ REDIS_URL is not set in your environment variables.');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

logger.warn('⚠️  WARNING: This will delete ALL data in your Upstash Redis database.');
logger.warn('This includes BullMQ queues, rate limits, and any other keys.');

rl.question('Are you absolutely sure? Type "yes" to continue: ', async (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    logger.info('❌ Operation cancelled.');
    process.exit(0);
  }

  const client = new IORedis(redisUrl, {
    tls: { rejectUnauthorized: false },
  });

  try {
    logger.info('Connecting to Upstash Redis...');

    await client.flushdb();

    logger.info('✅ Successfully cleared all data from Redis!');
  } catch (error) {
    logger.error('❌ Failed to clear Redis:', { error: error.message });
  } finally {
    client.quit();
    process.exit(0);
  }
});
