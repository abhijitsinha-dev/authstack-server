import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/models/session.model.js', () => ({
  default: { findById: jest.fn() },
}));
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { verify: jest.fn() },
}));

const { default: Session } = await import('../../src/models/session.model.js');
const { default: jwt } = await import('jsonwebtoken');
const { protect } = await import('../../src/middlewares/auth.middleware.js');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {} };
    res = {};
    next = jest.fn();
  });

  it('should throw 401 if no token is provided', async () => {
    await expect(protect(req, res, next)).rejects.toThrow('no token provided');
  });

  it('should throw 401 if token is invalid', async () => {
    req.headers.authorization = 'Bearer invalid-token';
    jwt.verify.mockImplementation(() => {
      throw new Error();
    });

    await expect(protect(req, res, next)).rejects.toThrow('token failed or expired');
  });

  it('should throw 401 if session is revoked', async () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1' });
    Session.findById.mockResolvedValue({ isRevoked: true });

    await expect(protect(req, res, next)).rejects.toThrow('Session has been revoked');
  });

  it('should call next() and attach user if token and session are valid', async () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1', role: 'user' });
    Session.findById.mockResolvedValue({ isRevoked: false });

    await protect(req, res, next);

    expect(req.user).toEqual({ id: 'u1', sessionId: 's1', role: 'user' });
    expect(next).toHaveBeenCalled();
  });
});
