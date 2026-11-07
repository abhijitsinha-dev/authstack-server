import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), http: jest.fn() },
  httpStream: { write: jest.fn() },
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn() },
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

describe('System Routes', () => {
  describe('GET /', () => {
    it('should return 200 with service info', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.api).toBe('v1');
    });
  });

  describe('GET /health', () => {
    it('should return a valid health response structure', async () => {
      const response = await request(app).get('/health');
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Unmatched Routes (404)', () => {
    it('should return 404 with a JSON error message', async () => {
      const response = await request(app).get('/some/random/path/that/does/not/exist');
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });
  });
});
