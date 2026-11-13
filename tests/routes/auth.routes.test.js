import { jest } from '@jest/globals';

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

const inMinutes = (n) => new Date(Date.now() + n * 60 * 1000);

// ─────────────────────────────────────────────
// 3. TESTS
// ─────────────────────────────────────────────

describe('POST /api/v1/auth/signup/request-otp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 and queue an email for valid input', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    jest.spyOn(User, 'create').mockResolvedValue({ _id: '123', name: 'John Doe' });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app).post('/api/v1/auth/signup/request-otp').send({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password123!',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-otp',
      expect.objectContaining({ email: 'john@example.com' })
    );
  });

  it('should return 400 for invalid email', async () => {
    const response = await request(app).post('/api/v1/auth/signup/request-otp').send({
      name: 'John Doe',
      email: 'not-an-email',
      password: 'Password123!',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('email');
  });
});

describe('POST /api/v1/auth/signup/resend-otp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 429 if the user requests a new OTP within 20 seconds', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Please wait');
  });

  it('should return 200 and resend the OTP if the cooldown has passed', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should return 400 if the user is already verified', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: true });

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('already verified');
  });
});

describe('POST /api/v1/auth/signup/verify-otp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200, set a cookie, and return accessToken for valid OTP (Web)', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({
      _id: 'u1',
      isVerified: false,
      save: jest.fn(),
    });
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

  it('should return 400 for an invalid OTP and increment attempts', async () => {
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
    expect(mockOtpRecord.attempts).toBe(2);
  });

  it('should return 429 and delete the OTP if max attempts are exceeded', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: false });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      _id: 'o1',
      codeHash: 'hash',
      attempts: 5,
      expiresAt: inMinutes(5),
    });
    jest.spyOn(Otp, 'deleteOne').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .send({ email: 'john@example.com', otp: '123456' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Maximum verification attempts exceeded');
  });

  it('should return 200 and include refreshToken in JSON for Mobile clients', async () => {
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
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined();
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200, set a cookie, and return accessToken for valid credentials', async () => {
    jest.spyOn(User, 'findOne').mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'u1', isVerified: true, password: 'hashed' }),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    jest.spyOn(Session, 'create').mockResolvedValue({});

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'john@example.com',
      password: 'Password123!',
    });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should return 401 for invalid credentials', async () => {
    jest.spyOn(User, 'findOne').mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'john@example.com',
      password: 'WrongPassword!',
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password.');
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clear cookie and return 200 for a valid session', async () => {
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: 's1', sub: 'u1' });
    jest.spyOn(Session, 'findById').mockResolvedValue({ isRevoked: false });
    jest.spyOn(Session, 'findByIdAndUpdate').mockResolvedValue({ _id: 's1' });

    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer fake-token');

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('refreshToken=;');
  });

  it('should return 401 without a valid token', async () => {
    const response = await request(app).post('/api/v1/auth/logout');
    expect(response.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// forgot-password
// ─────────────────────────────────────────────
describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 and queue a reset email for an existing verified user', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', name: 'John', isVerified: true });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('If an account exists');
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-reset-otp',
      expect.objectContaining({ email: 'john@example.com' })
    );
  });

  // 🔒 Anti-enumeration: non-existent users must produce the SAME 200 response
  // with NO queue job (identical to the verified-user path from the client's view)
  it('should return 200 and NOT queue an email for a non-existent user (anti-enumeration)', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('should return 200 and NOT queue an email for an unverified user (anti-enumeration)', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: false });

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'unverified@example.com' });

    expect(response.status).toBe(200);
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  // 👇 NEW: end-to-end proof that the two paths are indistinguishable
  // The three tests above prove "each path returns 200". This one proves
  // "both paths return the EXACT SAME response" — a stronger guarantee
  // that would catch a future change adding a conditional message.
  it('should return identical responses for existing and non-existent emails', async () => {
    // Case A: verified user (queues email)
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', name: 'John', isVerified: true });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
    jest.spyOn(Otp, 'deleteMany').mockResolvedValue({});
    jest.spyOn(Otp, 'create').mockResolvedValue({});

    const existing = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'john@example.com' });

    // Case B: non-existent user (does NOT queue email)
    jest.restoreAllMocks();
    jest.spyOn(User, 'findOne').mockResolvedValue(null);

    const missing = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    // 👇 The ENTIRE response body must be identical, not just the status
    expect(missing.status).toBe(existing.status);
    expect(missing.body).toEqual(existing.body);
  });

  it('should return 400 for an invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('email');
  });

  it('should return 429 if the 20-second cooldown has not passed', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: true });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

    const response = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Please wait');
    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// reset-password
// ─────────────────────────────────────────────
describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200, update the password, and revoke all sessions on success', async () => {
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
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('Password reset successfully');

    expect(Otp.findOneAndDelete).toHaveBeenCalledWith({ _id: 'otp123', purpose: 'reset' });
    expect(mockUser.save).toHaveBeenCalled();
    expect(Session.updateMany).toHaveBeenCalledWith(
      { user: 'u1' },
      expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) })
    );
  });

  it('should return 400 for an invalid OTP (wrong code)', async () => {
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
    expect(response.body.message).toContain('You have 3 attempts remaining');
  });

  it('should return 429 when max attempts are exceeded', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({
      attempts: 5,
      expiresAt: inMinutes(5),
    });

    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Maximum verification attempts exceeded');
  });

  it('should return 400 if the OTP has expired', async () => {
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
    expect(response.body.message).toContain('expired');
  });

  it('should return 400 for mismatched passwords', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'DifferentPassword456!',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Passwords do not match');
  });

  it('should return 400 for an invalid OTP format (not 6 digits)', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('6 digits');
  });

  it('should return 400 for a weak new password', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'john@example.com',
      otp: '123456',
      newPassword: 'weak',
      confirmPassword: 'weak',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('8');
  });

  it('should return 400 for an invalid email format', async () => {
    const response = await request(app).post('/api/v1/auth/reset-password').send({
      email: 'not-an-email',
      otp: '123456',
      newPassword: 'NewPassword123!',
      confirmPassword: 'NewPassword123!',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('valid email address');
  });
});
