import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/middlewares/rateLimit.middleware.js', () => ({
  rateLimit: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({}) },
}));

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn().mockResolvedValue({}),
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() },
  httpStream: { write: jest.fn() },
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');
const { default: User } = await import('../../src/models/user.model.js');
const { default: Otp } = await import('../../src/models/otp.model.js');
const { emailQueue } = await import('../../src/queues/email.queue.js');

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
      password: 'Password123',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
  });

  it('should return 400 for invalid email', async () => {
    const response = await request(app).post('/api/v1/auth/signup/request-otp').send({
      name: 'John Doe',
      email: 'not-an-email',
      password: 'Password123',
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
