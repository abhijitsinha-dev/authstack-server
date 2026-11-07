import { jest } from '@jest/globals';
import { validate } from '../../src/middlewares/validate.middleware.js';
import { requestOtpSchema } from '../../src/validators/auth.validator.js';
import { ApiError } from '../../src/utils/ApiError.js';

describe('validate middleware', () => {
  it('should attach valid data to req.body and call next()', () => {
    const req = { body: { name: 'John', email: 'john@example.com', password: 'Password123' } };
    const next = jest.fn();

    validate(requestOtpSchema)(req, {}, next);

    expect(next).toHaveBeenCalledWith(); // No error passed
    expect(req.body.email).toBe('john@example.com');
  });

  it('should call next() with an ApiError if validation fails', () => {
    // Send a complete payload with only the email invalid
    const req = {
      body: {
        name: 'John',
        email: 'not-an-email', // 👈 the actual thing we're testing
        password: 'Password123',
      },
    };
    const next = jest.fn();

    validate(requestOtpSchema)(req, {}, next);

    const errorArg = next.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(ApiError);
    expect(errorArg.status).toBe(400);
    expect(errorArg.message).toContain('email');
  });
});
