import { jest } from '@jest/globals';

// ─────────────────────────────────────────────
// 1. ESM MOCKS
// ─────────────────────────────────────────────

// Mock the rate limiter (bypass Upstash completely)
jest.unstable_mockModule('../../src/middlewares/rateLimit.middleware.js', () => ({
  rateLimit: () => (req, res, next) => next(),
}));

// Mock the BullMQ queue (prevent Redis connection)
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({}) },
}));

// Mock the Email Service (prevent Brevo API call in resend-otp)
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn().mockResolvedValue({}),
}));

// Mock the Winston logger
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
const { emailQueue } = await import('../../src/queues/email.queue.js');

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
    const recentOtp = { createdAt: new Date(Date.now() - 5000) };
    jest.spyOn(Otp, 'findOne').mockResolvedValue(recentOtp);

    const response = await request(app)
      .post('/api/v1/auth/signup/resend-otp')
      .send({ email: 'john@example.com' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Please wait');
  });

  it('should return 200 and resend the OTP if the cooldown has passed', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: '123', name: 'John', isVerified: false });
    const oldOtp = { createdAt: new Date(Date.now() - 25000) };
    jest.spyOn(Otp, 'findOne').mockResolvedValue(oldOtp);
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
    // 1. Mock User and OTP
    jest.spyOn(User, 'findOne').mockResolvedValue({
      _id: 'u1',
      isVerified: false,
      save: jest.fn(),
    });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ _id: 'o1', codeHash: 'hash', attempts: 0 });
    jest.spyOn(Otp, 'deleteOne').mockResolvedValue({});
    jest.spyOn(Session, 'create').mockResolvedValue({});

    // 2. Mock bcrypt to return true
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    // 3. Send request
    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .send({ email: 'john@example.com', otp: '123456' });

    // 4. Assertions
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeUndefined(); // Should not be in JSON for Web
    expect(response.headers['set-cookie']).toBeDefined(); // Should be in a cookie
  });

  it('should return 400 for an invalid OTP and increment attempts', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue({ _id: 'u1', isVerified: false });

    // Mock OTP with 1 existing attempt
    const mockOtpRecord = { _id: 'o1', codeHash: 'hash', attempts: 1, save: jest.fn() };
    jest.spyOn(Otp, 'findOne').mockResolvedValue(mockOtpRecord);

    // Mock bcrypt to return false
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
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ _id: 'o1', codeHash: 'hash', attempts: 5 });
    jest.spyOn(Otp, 'deleteOne').mockResolvedValue({});

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .send({ email: 'john@example.com', otp: '123456' });

    expect(response.status).toBe(429);
    expect(response.body.message).toContain('Maximum verification attempts exceeded');
  });

  it('should return 200 and include refreshToken in JSON for Mobile clients', async () => {
    // Setup valid mocks
    jest
      .spyOn(User, 'findOne')
      .mockResolvedValue({ _id: 'u1', isVerified: false, save: jest.fn() });
    jest.spyOn(Otp, 'findOne').mockResolvedValue({ _id: 'o1', codeHash: 'hash', attempts: 0 });
    jest.spyOn(Otp, 'deleteOne').mockResolvedValue({});
    jest.spyOn(Session, 'create').mockResolvedValue({});
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

    const response = await request(app)
      .post('/api/v1/auth/signup/verify-otp')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)') // 👈 Mobile UA
      .send({ email: 'john@example.com', otp: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBeDefined(); // Should be in JSON for Mobile
    expect(response.headers['set-cookie']).toBeUndefined(); // Should NOT have a cookie
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200, set a cookie, and return accessToken for valid credentials', async () => {
    // Mock the chained Mongoose query
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
    expect(response.body.data.refreshToken).toBeUndefined(); // Web flow
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
