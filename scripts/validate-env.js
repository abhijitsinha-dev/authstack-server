import Joi from 'joi';
import { logger } from '../src/config/logger.js';

// Define the schema for all required environment variables
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('production'),
  PORT: Joi.number().default(5000),

  MONGODB_URI: Joi.string().required(),

  BREVO_API_KEY: Joi.string().required(),
  BREVO_SENDER_EMAIL: Joi.string().email().required(),
  BREVO_SENDER_NAME: Joi.string().default('AuthStack'),

  REDIS_URL: Joi.string().required(),
  UPSTASH_REDIS_REST_URL: Joi.string().uri().required(),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().required(),

  ACCESS_TOKEN_SECRET: Joi.string().min(32).required(),
  REFRESH_TOKEN_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().default(30),
}).unknown(true); // Allow system vars (PATH, VERCEL_URL, etc.)

const { error } = envSchema.validate(process.env);

if (error) {
  logger.error('❌ Environment variable validation failed:');

  error.details.forEach((detail) => {
    logger.error(`   - ${detail.message}`);
  });

  logger.error('Please add the missing variables in your Vercel project settings and redeploy.');

  // Fails the Vercel build
  process.exit(1);
}

logger.info('✅ All required environment variables are present.');
