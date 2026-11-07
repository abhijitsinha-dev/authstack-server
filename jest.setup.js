import { jest } from '@jest/globals';

// Increase timeout for tests that might be slow (e.g., bcrypt hashing)
jest.setTimeout(30000);

// Set dummy environment variables for tests
process.env.NODE_ENV = 'test';
process.env.UPSTASH_REDIS_REST_URL = 'https://dummy.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'dummy-token';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';
