import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { error: jest.fn(), warn: jest.fn() },
}));

const { errorHandler } = await import('../../src/middlewares/error.middleware.js');
const { ApiError } = await import('../../src/utils/ApiError.js');

describe('errorHandler middleware', () => {
  let res;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ─────────────────────────────────────────────
  // Existing behavior — ApiError and generic errors
  // ─────────────────────────────────────────────
  it('should mask 500 errors in production', () => {
    process.env.NODE_ENV = 'production';

    const err = new Error('Sensitive DB failure');
    err.status = 500;

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
    });
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

  // ─────────────────────────────────────────────
  // Mongoose error mapping
  // ─────────────────────────────────────────────
  describe('Mongoose ValidationError', () => {
    it('should map to 400 and surface the first field message', () => {
      const err = new Error('User validation failed');
      err.name = 'ValidationError';
      err.errors = {
        password: { message: 'Password too weak' },
        email: { message: 'Invalid format' },
      };

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Password too weak',
      });
    });

    it('should fall back to a generic message if no field errors are present', () => {
      const err = new Error('User validation failed');
      err.name = 'ValidationError';
      err.errors = {};

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Validation failed',
      });
    });
  });

  describe('Mongoose duplicate key (E11000)', () => {
    it('should map email conflicts to 409 with a user-facing message', () => {
      const err = new Error(
        'E11000 duplicate key error collection: authstack.users index: email_1 dup key: { email: "victim@example.com" }'
      );
      err.code = 11000;
      err.keyPattern = { email: 1 };
      err.keyValue = { email: 'victim@example.com' };

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(409);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(false);
      expect(body.message).toContain('already exists');

      // 🔒 Proves no internal detail leaks: not the raw MongoDB message,
      // not the index name, not the offending email
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('E11000');
      expect(serialized).not.toContain('email_1');
      expect(serialized).not.toContain('victim@example.com');
    });

    it('should use a generic message for non-email unique violations', () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      err.keyPattern = { username: 1 };
      err.keyValue = { username: 'admin' };

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'A record with these details already exists.',
      });
    });
  });

  describe('Mongoose CastError', () => {
    it('should map to 400 with a safe message (no path leak)', () => {
      const err = new Error('Cast to ObjectId failed for value "abc" at path "_id"');
      err.name = 'CastError';
      err.path = '_id';
      err.kind = 'ObjectId';

      errorHandler(err, {}, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);

      const body = res.json.mock.calls[0][0];
      expect(body.message).toBe('Invalid request.');

      // 🔒 Proves the raw cast detail (path, value) is not echoed back
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('ObjectId');
      expect(serialized).not.toContain('_id');
    });
  });

  // ─────────────────────────────────────────────
  // Interaction: ApiError takes precedence over mapping
  // ─────────────────────────────────────────────
  it('should not apply Mongoose mapping to ApiError (err.status wins)', () => {
    // A contrived case: ApiError with a `name` that would otherwise trigger mapping
    const err = new ApiError(401, 'Custom auth error');
    err.name = 'ValidationError'; // would map to 400 if status weren't set
    err.errors = { x: { message: 'ignored' } };

    errorHandler(err, {}, res, jest.fn());

    // 401 wins — mapping block is skipped entirely
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Custom auth error',
    });
  });
});
