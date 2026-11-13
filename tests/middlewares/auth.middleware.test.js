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

  // ─────────────────────────────────────────────
  // Missing / malformed header
  // ─────────────────────────────────────────────
  it('should throw 401 if no Authorization header is provided', async () => {
    await expect(protect(req, res, next)).rejects.toThrow('no token provided');
  });

  // 👇 Parameterized: 4 malformed shapes, same outcome
  it.each([
    { description: 'empty Authorization header', header: '' },
    { description: 'whitespace-only Bearer', header: 'Bearer ' },
    { description: 'non-Bearer scheme (e.g., Basic)', header: 'Basic dXNlcjpwYXNz' },
    { description: 'Bearer without whitespace', header: 'Bearerabc123' },
  ])('should throw 401 for $description', async ({ header }) => {
    req.headers.authorization = header;
    await expect(protect(req, res, next)).rejects.toThrow('no token provided');
  });

  // ─────────────────────────────────────────────
  // Token verification (JWT layer)
  // ─────────────────────────────────────────────
  it('should throw 401 if the token is invalid or expired', async () => {
    req.headers.authorization = 'Bearer invalid-token';
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    await expect(protect(req, res, next)).rejects.toThrow('token failed or expired');
  });

  // ─────────────────────────────────────────────
  // Session verification (DB layer)
  // ─────────────────────────────────────────────
  it('should throw 401 if the session does not exist', async () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1' });
    Session.findById.mockResolvedValue(null);

    await expect(protect(req, res, next)).rejects.toThrow('Session has been revoked or expired');
  });

  it('should throw 401 if the session is revoked', async () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1' });
    Session.findById.mockResolvedValue({ isRevoked: true });

    await expect(protect(req, res, next)).rejects.toThrow('Session has been revoked');
  });

  // ─────────────────────────────────────────────
  // Success
  // ─────────────────────────────────────────────
  it('should call next() and attach user if token and session are valid', async () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1', role: 'user' });
    Session.findById.mockResolvedValue({ isRevoked: false });

    await protect(req, res, next);

    expect(req.user).toEqual({ id: 'u1', sessionId: 's1', role: 'user' });
    expect(next).toHaveBeenCalledWith();
  });

  // ─────────────────────────────────────────────
  // Case-insensitive Bearer scheme
  // ─────────────────────────────────────────────
  it.each([
    { description: 'lowercase "bearer"', header: 'bearer valid-token' },
    { description: 'uppercase "BEARER"', header: 'BEARER valid-token' },
    { description: 'mixed case "BeArEr"', header: 'BeArEr valid-token' },
  ])('should accept $description', async ({ header }) => {
    req.headers.authorization = header;
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1', role: 'user' });
    Session.findById.mockResolvedValue({ isRevoked: false });

    await protect(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACCESS_TOKEN_SECRET);
    expect(req.user).toEqual({ id: 'u1', sessionId: 's1', role: 'user' });
    expect(next).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────
  // Multiple whitespace characters after Bearer
  // ─────────────────────────────────────────────
  it('should accept multiple spaces between "Bearer" and the token', async () => {
    req.headers.authorization = 'Bearer    valid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1', role: 'user' });
    Session.findById.mockResolvedValue({ isRevoked: false });

    await protect(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACCESS_TOKEN_SECRET);
    expect(next).toHaveBeenCalled();
  });

  it('should accept a tab between "Bearer" and the token', async () => {
    req.headers.authorization = 'Bearer\tvalid-token';
    jwt.verify.mockReturnValue({ sid: 's1', sub: 'u1', role: 'user' });
    Session.findById.mockResolvedValue({ isRevoked: false });

    await protect(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.ACCESS_TOKEN_SECRET);
    expect(next).toHaveBeenCalled();
  });
});
