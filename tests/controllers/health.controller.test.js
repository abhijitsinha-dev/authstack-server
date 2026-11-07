import { jest } from '@jest/globals';

// ─────────────────────────────────────────────
// Mock mongoose BEFORE importing the controller
// ─────────────────────────────────────────────
const mockConnection = { readyState: 1 };

jest.unstable_mockModule('mongoose', () => ({
  default: {
    connection: mockConnection,
  },
}));

const { getHealth } = await import('../../src/controllers/health.controller.js');

describe('health.controller', () => {
  let res;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should return 200 and "connected" when readyState is 1 (production)', () => {
    process.env.NODE_ENV = 'production';
    mockConnection.readyState = 1;

    getHealth({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        database: 'connected',
      })
    );
  });

  it('should return 503 and "disconnected" when readyState is 0 (production)', () => {
    process.env.NODE_ENV = 'production';
    mockConnection.readyState = 0;

    getHealth({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        database: 'disconnected',
      })
    );
  });

  it('should always return 200 in development, even if DB is down', () => {
    process.env.NODE_ENV = 'development';
    mockConnection.readyState = 0;

    getHealth({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        database: 'disconnected',
      })
    );
  });
});
