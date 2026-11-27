import { jest } from '@jest/globals';
import crypto from 'crypto';

// ─────────────────────────────────────────────
// 1. ESM MOCKS
// ─────────────────────────────────────────────

jest.unstable_mockModule('../../src/middlewares/rateLimit.middleware.js', () => ({
  rateLimit: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({}) },
}));

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn().mockResolvedValue({}),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({}),
  sendEmailChangeOtpEmail: jest.fn().mockResolvedValue({}), // 👈 NEW
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() },
  httpStream: { write: jest.fn() },
}));

// ─────────────────────────────────────────────
// 2. DYNAMIC IMPORTS
// ─────────────────────────────────────────────
const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');
const { default: User } = await import('../../src/models/user.model.js');
const { default: Otp } = await import('../../src/models/otp.model.js');
const { default: Session } = await import('../../src/models/session.model.js');
const { default: bcrypt } = await import('bcryptjs');
const { default: jwt } = await import('jsonwebtoken');
const { emailQueue } = await import('../../src/queues/email.queue.js');
const { sendEmailChangeOtpEmail } = await import('../../src/services/email.service.js');

const inMinutes = (n) => new Date(Date.now() + n * 60 * 1000);
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

// ─────────────────────────────────────────────
// 3. TESTS
// ─────────────────────────────────────────────

describe('GET /api/v1/auth/username-availability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns only the availability result for a free username', async () => {
    jest.spyOn(User, 'exists').mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/auth/username-availability')
      .query({ username: 'john_doe' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { available: true } });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects a reserved username', async () => {
    const response = await request(app)
      .get('/api/v1/auth/username-availability')
      .query({ username: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('admin is not allowed');
  });

  it('returns unavailable when a user already owns the username', async () => {
    jest.spyOn(User, 'exists').mockResolvedValue({ _id: 'existing-id' });

    const response = await request(app)
      .get('/api/v1/auth/username-availability')
      .query({ username: 'john_doe' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { available: false } });
  });

  it('validates the username query parameter', async () => {
    const response = await request(app)
      .get('/api/v1/auth/username-availability')
      .query({ username: 'John Doe' });

    expect(response.status).toBe(400);
  });

  it('requires a username query parameter', async () => {
    const response = await request(app).get('/api/v1/auth/username-availability');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Username is required.');
  });
});

describe('GET /api/v1/auth/email-availability', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns available when no verified account owns the normalized email', async () => {
    jest.spyOn(User, 'exists').mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/auth/email-availability')
      .query({ email: '  JOHN@EXAMPLE.COM  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { available: true } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(User.exists).toHaveBeenCalledWith({
      email: 'john@example.com',
      isVerified: true,
    });
  });

  it('returns unavailable when a verified user owns the email', async () => {
    jest.spyOn(User, 'exists').mockResolvedValue({ _id: 'existing-id' });

    const response = await request(app)
      .get('/api/v1/auth/email-availability')
      .query({ email: 'john@example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { available: false } });
  });

  it('validates the email query parameter', async () => {
    const response = await request(app)
      .get('/api/v1/auth/email-availability')
      .query({ email: 'not-an-email' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/change-username', () => {
  beforeEach(() => jest.clearAllMocks());

  it('changes the authenticated user username and returns the normalized value', async () => {
    const mockUser = { username: 'old_name', save: jest.fn().mockResolvedValue({}) };
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(User, 'findById').mockResolvedValue(mockUser);
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/auth/change-username')
      .set('Authorization', 'Bearer valid-token')
      .send({ newUsername: '  NEW_Name  ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Username changed successfully.',
      data: { username: 'new_name' },
    });
    expect(mockUser.username).toBe('new_name');
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('returns 400 for a reserved username', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });

    const response = await request(app)
      .post('/api/v1/auth/change-username')
      .set('Authorization', 'Bearer valid-token')
      .send({ newUsername: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('admin is not allowed');
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('returns 409 when another account owns the requested username', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(User, 'findById').mockResolvedValue({
      username: 'old_name',
      save: jest.fn(),
    });
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'other-user' });

    const response = await request(app)
      .post('/api/v1/auth/change-username')
      .set('Authorization', 'Bearer valid-token')
      .send({ newUsername: 'taken_name' });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('This username is already in use.');
  });

  it('requires an authenticated session', async () => {
    const response = await request(app)
      .post('/api/v1/auth/change-username')
      .send({ newUsername: 'new_name' });

    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/signup/request-otp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 and queue an email for valid input', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockResolvedValue({ _id: '123', username: 'john_doe' });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app).post('/api/v1/auth/signup/request-otp').send({
      username: 'john_doe',
      email: 'john@example.com',
      password: 'Password123!',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
  });

  it('should return 400 for invalid username', async () => {
    const response = await request(app).post('/api/v1/auth/signup/request-otp').send({
      username: 'John Doe',
      email: 'john@example.com',
      password: 'Password123!',
    });

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid email', async () => {
    const response = await request(app).post('/api/v1/auth/signup/request-otp').send({
      username: 'john_doe',
      email: 'not-an-email',
      password: 'Password123!',
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/auth/signup/resend-otp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 429 within cooldown', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Please wait');
  });

  it('should return 200 when cooldown passed', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(200);
  });

  it('should return 400 if user already verified', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: true });

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('already verified');
  });
});

describe('POST /api/v1/auth/signup/verify-otp', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200, set cookie, return accessToken (Web)', async () => {
    jest
      .spyOn(User, 'findOne')
      .mockResolvedValue({ _id: 'u1', isVerified: false, save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'o1',
      codeHash: 'hash',
      attempts: 0,
      expiresAt: inMinutes(5),
    });
    jest.spyOn(Otp, 'deleteOne').mockResolvedValue({});
    jest.spyOn(Session, 'create').mockResolvedValue({});
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .send({ email: 'john@example.com', otp: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should return 400 on invalid OTP and increment attempts', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: false });
    const mockOtpRecord = {
      _id: 'o1',
      codeHash: 'hash',
      attempts: 1,
      expiresAt: inMinutes(5),
      save: jest.fn(),
    };
    jest.spyOn(Otp, 'findOne').mockResolvedValue(mockOtpRecord);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .send({ email: 'john@example.com', otp: '000000' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('You have 3 attempts remaining');
  });

  it('should return 429 when max attempts exceeded', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'o1',
      codeHash: 'hash',
      attempts: 5,
      expiresAt: inMinutes(5),
    });

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .send({ email: 'john@example.com', otp: '123456' });

    expect(response.status).toBe(429);
  });

  it('should return 200 with refreshToken for mobile', async () => {
    jest
      .spyOn(User, 'findOne')
      .mockResolvedValue({ _id: 'u1', isVerified: false, save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'o1',
      codeHash: 'hash',
      attempts: 0,
      expiresAt: inMinutes(5),
    });
    jest.spyOn(Otp, 'deleteOne').mockResolvedValue({});
    jest.spyOn(Session, 'create').mockResolvedValue({});
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)')
      .send({ email: 'john@example.com', otp: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.data.refreshToken).toBeDefined();
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 with cookie for valid credentials', async () => {
    jest.spyOn(User, 'findOne').mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', isVerified: true, password: 'hashed' }),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Session, 'create').mockResolvedValue({});

    const response = await request(app).post('/api/v1/auth/login').send({
      identifier: 'john@example.com',
      password: 'Password123!',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should allow login with a username identifier', async () => {
    jest.spyOn(User, 'findOne').mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', isVerified: true, password: 'hashed' }),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Session, 'create').mockResolvedValue({});

    const response = await request(app).post('/api/v1/auth/login').send({
      identifier: 'JOHN_DOE',
      password: 'Password123!',
    });

    expect(response.status).toBe(200);
    expect(User.findOne).toHaveBeenCalledWith({ username: 'john_doe' });
    expect(response.body.data.accessToken).toBeDefined();
  });

  it('should return 401 for invalid credentials', async () => {
    jest.spyOn(User, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const response = await request(app).post('/api/v1/auth/login').send({
      identifier: 'john@example.com',
      password: 'WrongPassword!',
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password.');
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should rotate tokens (mobile) and return both in body', async () => {
    const token = 'valid-token';
    const mockSession = { isRevoked: false, refreshTokenHash: sha256(token), save: jest.fn() };
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue(mockSession);

    const response = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: token });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
  });

  it('should rotate tokens (web) and set cookie', async () => {
    const token = 'valid-token';
    const mockSession = { isRevoked: false, refreshTokenHash: sha256(token), save: jest.fn() };
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue(mockSession);

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should return 401 on reuse detection', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    const mockSession = {
      isRevoked: false,
      refreshTokenHash: 'a-hash-from-a-previous-rotation',
      save: jest.fn(),
    };
    jest.spyOn(Session, 'findById').mockResolvedValue(mockSession);

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'stolen-token' });

    expect(response.status).toBe(401);
    expect(response.body.message).toContain('reuse detected');
    expect(mockSession.isRevoked).toBe(true);
  });

  it('should return 401 with no token', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({});
    expect(response.status).toBe(401);
  });

  it('should return 401 for malformed token', async () => {
    jest.spyOn(jwt, 'verify').mockImplementation(() => {
      throw new Error('jwt malformed');
    });
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' });
    expect(response.status).toBe(401);
  });

  it('should return 401 if session revoked', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: true });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'valid-token' });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return the current user with no-store', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1', role: 'user' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(User, 'findById').mockResolvedValue({
      _id: 'u1',
      username: 'john',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user',
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data.user).toEqual({
      id: 'u1',
      username: 'john',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('should return 401 without a token', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
  });

  it('should return 401 if session revoked', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: true });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(401);
  });

  it('should return 401 if user deleted (stale session)', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'deleted-user' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(User, 'findById').mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/auth/sessions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 with sessions array', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });

    const mockChain = { sort: jest.fn(), select: jest.fn(), lean: jest.fn() };
    mockChain.sort.mockReturnValue(mockChain);
    mockChain.select.mockReturnValue(mockChain);
    mockChain.lean.mockResolvedValue([
      {
        _id: 's1',
        ip: '127.0.0.1',
        userAgent: 'Mozilla',
        createdAt: new Date('2026-11-14T10:00:00Z'),
        lastUsedAt: new Date('2026-11-14T12:00:00Z'),
      },
    ]);
    jest.spyOn(Session, 'find').mockReturnValue(mockChain);

    const response = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data.sessions[0].isCurrent).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('should return 401 without a token', async () => {
    const response = await request(app).get('/api/v1/auth/sessions');
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/v1/auth/sessions/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 when revoking another session', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Session, 'findOneAndUpdate').mockResolvedValue({ _id: 's2', isRevoked: true });

    const response = await request(app)
      .delete('/api/v1/auth/sessions/s2')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
  });

  it('should return 400 for current session', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    const findOneAndUpdateSpy = jest.spyOn(Session, 'findOneAndUpdate');

    const response = await request(app)
      .delete('/api/v1/auth/sessions/s1')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(400);
    expect(findOneAndUpdateSpy).not.toHaveBeenCalled();
  });

  it('should return 404 if not found', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Session, 'findOneAndUpdate').mockResolvedValue(null);

    const response = await request(app)
      .delete('/api/v1/auth/sessions/nonexistent')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });

  it('should return 401 without token', async () => {
    const response = await request(app).delete('/api/v1/auth/sessions/s2');
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/v1/auth/sessions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 with revokedCount', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Session, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

    const response = await request(app)
      .delete('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.data.revokedCount).toBe(2);
  });

  it('should return revokedCount 0 when none exist', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Session, 'updateMany').mockResolvedValue({ modifiedCount: 0 });

    const response = await request(app)
      .delete('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(response.body.data.revokedCount).toBe(0);
  });

  it('should return 401 without token', async () => {
    const response = await request(app).delete('/api/v1/auth/sessions');
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should clear cookie and return 200', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Session, 'findByIdAndUpdate').mockResolvedValue({ _id: 's1' });

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer fake-token');

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('refreshToken=;');
  });

  it('should return 401 without token', async () => {
    const response = await request(app).post('/api/v1/auth/logout');
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  let mockUser;
  let selectMock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { _id: 'u1', email: 'test@example.com', password: 'hashed-old', save: jest.fn() };
    selectMock = jest.fn().mockResolvedValue(mockUser);
    jest.spyOn(User, 'findById').mockReturnValue({ select: selectMock });
  });

  it('should return 200 and revoke other sessions', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Session, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      });

    expect(response.status).toBe(200);
    expect(response.body.data.revokedCount).toBe(2);
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('should return 200 with generic message when no other sessions', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Session, 'updateMany').mockResolvedValue({ modifiedCount: 0 });

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      });

    expect(response.body.message).toBe('Password changed successfully.');
    expect(response.body.data.revokedCount).toBe(0);
  });

  it('should return 401 on wrong current password', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      });

    expect(response.status).toBe(401);
  });

  it('should return 400 for same password', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'OldPassword123!',
        confirmPassword: 'OldPassword123!',
      });

    expect(response.status).toBe(400);
  });

  it('should return 400 for mismatched confirmPassword (Joi)', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'DifferentPassword456!',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Passwords do not match.');
  });

  it('should return 400 for weak password (Joi)', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });

    const response = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', 'Bearer valid-token')
      .send({
        currentPassword: 'OldPassword123!',
        newPassword: 'weak',
        confirmPassword: 'weak',
      });

    expect(response.status).toBe(400);
  });

  it('should return 401 without token', async () => {
    const response = await request(app).post('/api/v1/auth/change-password').send({
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      confirmPassword: 'NewPassword456!',
    });
    expect(response.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// NEW: POST /change-email/request-otp
// ─────────────────────────────────────────────
describe('POST /api/v1/auth/change-email/request-otp', () => {
  let mockUser;
  let selectMock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      _id: 'u1',
      email: 'old@example.com',
      name: 'John',
      password: 'hashed-old',
      save: jest.fn(),
    };
    selectMock = jest.fn().mockResolvedValue(mockUser);
    jest.spyOn(User, 'findById').mockReturnValue({ select: selectMock });
  });

  it('should return 200 and send OTP to the new email', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(Otp, 'findOne').mockResolvedValue(null);
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/change-email/request-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', currentPassword: 'OldPassword123!' });

    expect(response.status).toBe(200);
    expect(response.body.data.newEmail).toBe('new@example.com');
    expect(sendEmailChangeOtpEmail).toHaveBeenCalledWith(
      'new@example.com',
      'John',
      expect.stringMatching(/^\d{6}$/)
    );
  });

  it('should return 401 on wrong current password', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    const response = await request(app)
      .post('/api/v1/auth/change-email/request-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', currentPassword: 'WrongPassword123!' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Current password is incorrect.');
  });

  it('should return 400 if same email', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/v1/auth/change-email/request-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'old@example.com', currentPassword: 'OldPassword123!' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('different from current');
  });

  it('should return 409 if email taken', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'other', email: 'new@example.com' });

    const response = await request(app)
      .post('/api/v1/auth/change-email/request-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', currentPassword: 'OldPassword123!' });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('already in use');
  });

  it('should return 400 for invalid new email format (Joi)', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });

    const response = await request(app)
      .post('/api/v1/auth/change-email/request-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'not-an-email', currentPassword: 'OldPassword123!' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('valid email address');
  });

  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/change-email/request-otp')
      .send({ newEmail: 'new@example.com', currentPassword: 'OldPassword123!' });
    expect(response.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// NEW: POST /change-email/verify-otp
// ─────────────────────────────────────────────
describe('POST /api/v1/auth/change-email/verify-otp', () => {
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { _id: 'u1', email: 'old@example.com', save: jest.fn() };
    jest.spyOn(User, 'findById').mockResolvedValue(mockUser);
  });

  it('should return 200, update email, and revoke other sessions', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'otp123',
      codeHash: 'hash',
      attempts: 0,
      expiresAt: inMinutes(5),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Otp, 'findOneAndDelete').mockResolvedValue({ _id: 'otp123' });
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(Session, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

    const response = await request(app)
      .post('/api/v1/auth/change-email/verify-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', otp: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.data.revokedCount).toBe(2);
    expect(response.body.data.newEmail).toBe('new@example.com');
    expect(mockUser.email).toBe('new@example.com');
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('should return 200 with generic message when no other sessions', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'otp123',
      codeHash: 'hash',
      attempts: 0,
      expiresAt: inMinutes(5),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Otp, 'findOneAndDelete').mockResolvedValue({ _id: 'otp123' });
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(Session, 'updateMany').mockResolvedValue({ modifiedCount: 0 });

    const response = await request(app)
      .post('/api/v1/auth/change-email/verify-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', otp: '123456' });

    expect(response.body.message).toBe('Email changed successfully.');
    expect(response.body.data.revokedCount).toBe(0);
  });

  it('should return 400 on wrong OTP', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'otp123',
      codeHash: 'hash',
      attempts: 1,
      expiresAt: inMinutes(5),
      save: jest.fn(),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    const response = await request(app)
      .post('/api/v1/auth/change-email/verify-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', otp: '000000' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('You have 3 attempts remaining');
  });

  it('should return 400 for invalid OTP format (Joi)', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });

    const response = await request(app)
      .post('/api/v1/auth/change-email/verify-otp')
      .set('Authorization', 'Bearer valid-token')
      .send({ newEmail: 'new@example.com', otp: '123' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('6 digits');
  });

  it('should return 401 without token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/change-email/verify-otp')
      .send({ newEmail: 'new@example.com', otp: '123456' });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 and queue reset email', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', name: 'John', isVerified: true });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(200);
    expect(emailQueue.add).toHaveBeenCalled();
  });

  it('should return 200 for non-existent user (anti-enumeration)', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(response.status).toBe(200);
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
  });

  it('should return 429 within cooldown', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: true });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(429);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 and revoke all sessions', async () => {
    const mockUser = { _id: 'u1', save: jest.fn() };
    jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'otp123',
      codeHash: 'hash',
      attempts: 0,
      expiresAt: inMinutes(5),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Otp, 'findOneAndDelete').mockResolvedValue({ _id: 'otp123' });
    jest.spyOn(Session, 'updateMany').mockResolvedValue({});

    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(200);
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('should return 400 on wrong OTP', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'otp123',
      codeHash: 'hash',
      attempts: 1,
      expiresAt: inMinutes(5),
      save: jest.fn(),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '000000',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(400);
  });

  it('should return 429 when locked out', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ attempts: 5, expiresAt: inMinutes(5) });

    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(429);
  });

  it('should return 400 for expired OTP', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'otp123',
      codeHash: 'hash',
      attempts: 0,
      expiresAt: new Date(Date.now() - 1000),
    });

    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(400);
  });

  it('should return 400 for mismatched passwords', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'DifferentPassword456!',
    });
    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid OTP format', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });
    expect(response.status).toBe(400);
  });

  it('should return 400 for weak password', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'weak',
      confirmPassword: 'weak',
    });
    expect(response.status).toBe(400);
  });
});
