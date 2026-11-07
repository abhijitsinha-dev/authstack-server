import { jest } from '@jest/globals';

// ─────────────────────────────────────────────
// 1. MOCK ALL DEPENDENCIES
// ─────────────────────────────────────────────

// Mock the Models
jest.unstable_mockModule('../../src/models/user.model.js', () => ({
  default: {
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/models/otp.model.js', () => ({
  default: {
    findOne: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
}));

// Mock the BullMQ Queue
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn() },
}));

// Mock the Email Service (for the synchronous resend)
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn(),
}));

// Mock the OTP Generator to return a predictable value
jest.unstable_mockModule('../../src/utils/otp.js', () => ({
  generateHashedOtp: jest.fn().mockResolvedValue({ otp: '123456', hashedOtp: 'hashed-otp' }),
}));

// Mock the Logger
jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

// ─────────────────────────────────────────────
// 2. DYNAMIC IMPORTS
// ─────────────────────────────────────────────
const { default: User } = await import('../../src/models/user.model.js');
const { default: Otp } = await import('../../src/models/otp.model.js');
const { emailQueue } = await import('../../src/queues/email.queue.js');
const { sendSignupOtpEmail } = await import('../../src/services/email.service.js');
const { requestSignupOtp, resendSignupOtp } = await import('../../src/services/auth.service.js');

// ─────────────────────────────────────────────
// 3. TESTS
// ─────────────────────────────────────────────
describe('auth.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestSignupOtp', () => {
    const payload = { name: 'John', email: 'john@example.com', password: 'Password123' };

    it('should throw 409 if user exists and is already verified', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });

      await expect(requestSignupOtp(payload)).rejects.toThrow(
        'An account with this email already exists. Please log in.'
      );
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should delete old user, create new user, save OTP, and push to queue', async () => {
      // Setup mocks
      User.findOne.mockResolvedValue({ _id: 'old-id', isVerified: false });
      User.deleteOne.mockResolvedValue({});
      User.create.mockResolvedValue({ _id: 'new-id' });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      emailQueue.add.mockResolvedValue({});

      await requestSignupOtp(payload);

      // Assertions
      expect(User.deleteOne).toHaveBeenCalledWith({ _id: 'old-id' });
      expect(User.create).toHaveBeenCalledWith(payload);
      expect(Otp.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'john@example.com', codeHash: 'hashed-otp' })
      );
      expect(emailQueue.add).toHaveBeenCalledWith('send-otp', {
        email: 'john@example.com',
        name: 'John',
        otp: '123456',
      });
    });
  });

  describe('resendSignupOtp', () => {
    const email = 'john@example.com';

    it('should throw 404 if user does not exist', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(resendSignupOtp({ email })).rejects.toThrow(
        'User not found. Please sign up first.'
      );
    });

    it('should throw 400 if user is already verified', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });

      await expect(resendSignupOtp({ email })).rejects.toThrow(
        'Account is already verified. Please log in.'
      );
    });

    it('should throw 429 if the cooldown (20s) has not passed', async () => {
      User.findOne.mockResolvedValue({ isVerified: false });
      // Mock an OTP created 5 seconds ago
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

      await expect(resendSignupOtp({ email })).rejects.toThrow(/Please wait \d+ seconds/);
      expect(sendSignupOtpEmail).not.toHaveBeenCalled();
    });

    it('should generate new OTP and send email synchronously if cooldown passed', async () => {
      User.findOne.mockResolvedValue({ name: 'John', isVerified: false });
      // Mock an OTP created 25 seconds ago
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      sendSignupOtpEmail.mockResolvedValue({});

      await resendSignupOtp({ email });

      expect(Otp.create).toHaveBeenCalled();
      expect(sendSignupOtpEmail).toHaveBeenCalledWith('john@example.com', 'John', '123456');
    });
  });
});
