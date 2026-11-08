import { jest } from '@jest/globals';

const mockLimitFn = jest.fn();

jest.unstable_mockModule('@upstash/ratelimit', () => ({
  Ratelimit: class {
    constructor() {
      this.limit = mockLimitFn;
    }
    static slidingWindow() {
      return 'mocked-window';
    }
  },
}));

jest.unstable_mockModule('../../src/config/rateLimiter.js', () => ({
  redis: {},
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

const { rateLimit } = await import('../../src/middlewares/rateLimit.middleware.js');
const { logger } = await import('../../src/config/logger.js');

describe('rateLimit middleware', () => {
  let req;
  let res;
  let next;
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();

    req = { ip: '127.0.0.1' };
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();

    middleware = rateLimit({ limit: 5, window: '1 m', prefix: 'test-limit' });
  });

  it('should call next() and set headers when the request is allowed', async () => {
    mockLimitFn.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 1700000000000 });

    await middleware(req, res, next);

    expect(mockLimitFn).toHaveBeenCalledWith('127.0.0.1');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
    expect(next).toHaveBeenCalledWith();
  });

  it('should return 429 and NOT call next() when the limit is exceeded', async () => {
    mockLimitFn.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 1700000000000 });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Too many requests. Please try again later.',
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('should "fail open" and call next() if the rate limiter crashes', async () => {
    mockLimitFn.mockRejectedValue(new Error('Upstash network error'));

    await middleware(req, res, next);

    expect(logger.error).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
