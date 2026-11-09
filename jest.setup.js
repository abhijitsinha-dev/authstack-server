import { jest } from '@jest/globals';

// Increase timeout for tests that might be slow (e.g., bcrypt hashing)
jest.setTimeout(30000);

// Set dummy environment variables for tests to prevent module import crashes
process.env.NODE_ENV = 'test';
process.env.PORT = '5000';

// Database
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

// Brevo (Email)
process.env.BREVO_API_KEY = 'test-brevo-api-key';
process.env.BREVO_SENDER_EMAIL = 'test@example.com';
process.env.BREVO_SENDER_NAME = 'Test AuthStack';

// Redis & Upstash
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.UPSTASH_REDIS_REST_URL = 'https://dummy.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'dummy-token';

// JWT Secrets
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
