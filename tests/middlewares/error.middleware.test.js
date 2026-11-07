import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

const { errorHandler } = await import('../../src/middlewares/error.middleware.js');
const { ApiError } = await import('../../src/utils/ApiError.js');

describe('errorHandler middleware', () => {
  let res;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should mask 500 errors in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const err = new Error('Sensitive DB failure');
    err.status = 500;

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('should return the actual error message for 4xx errors', () => {
    const err = new ApiError(400, 'Invalid email');

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid email',
    });
  });
});
