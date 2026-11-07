import { jest } from '@jest/globals';
import { getRoot } from '../../src/controllers/root.controller.js';

describe('root.controller', () => {
  let req;
  let res;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    res = { json: jest.fn().mockReturnThis() };
    req = {};
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should return the minimal payload in production', () => {
    process.env.NODE_ENV = 'production';
    getRoot(req, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', api: 'v1' });
  });

  it('should return the detailed payload in development', () => {
    process.env.NODE_ENV = 'development';
    getRoot(req, res);
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      service: 'authstack',
      environment: 'development',
      api: 'v1',
      health: '/health',
    });
  });

  it('should default to development environment if NODE_ENV is not set', () => {
    delete process.env.NODE_ENV;
    getRoot(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'development', service: 'authstack' })
    );
  });
});
