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
    deleteOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/models/session.model.js', () => ({
  default: {
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(), // 👈 Added this line
  },
}));

// Mock the BullMQ Queue
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn() },
}));

// Mock the Email Service
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn(),
}));

// Mock the OTP Generator
jest.unstable_mockModule('../../src/utils/otp.js', () => ({
  generateHashedOtp: jest.fn().mockResolvedValue({ otp: '123456', hashedOtp: 'hashed-otp' }),
}));

// Mock Bcrypt
jest.unstable_mockModule('bcryptjs', () => ({
  default: { compare: jest.fn() },
}));

// Mock JWT Utilities
jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  generateAccessToken: jest.fn().mockReturnValue('fake-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('fake-refresh-token'),
  hashToken: jest.fn().mockReturnValue('fake-hash'),
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
const { default: Session } = await import('../../src/models/session.model.js');
const { default: bcrypt } = await import('bcryptjs');
const { emailQueue } = await import('../../src/queues/email.queue.js');
const { sendSignupOtpEmail } = await import('../../src/services/email.service.js');
const { requestSignupOtp, resendSignupOtp, verifySignupOtp, loginUser, logoutUser } =
  await import('../../src/services/auth.service.js');

// ─────────────────────────────────────────────
// 3. TESTS
// ─────────────────────────────────────────────
describe('auth.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestSignupOtp', () => {
    const payload = { name: 'John', email: 'john@example.com', password: 'Password123!' };

    it('should throw 409 if user exists and is already verified', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });

      await expect(requestSignupOtp(payload)).rejects.toThrow(
        'An account with this email already exists. Please log in.'
      );
      expect(User.create).not.toHaveBeenCalled();
    });

    it('should delete old user, create new user, save OTP, and push to queue', async () => {
      User.findOne.mockResolvedValue({ _id: 'old-id', isVerified: false });
      User.deleteOne.mockResolvedValue({});
      User.create.mockResolvedValue({ _id: 'new-id' });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      emailQueue.add.mockResolvedValue({});

      await requestSignupOtp(payload);

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
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

      await expect(resendSignupOtp({ email })).rejects.toThrow(/Please wait \d+ seconds/);
      expect(sendSignupOtpEmail).not.toHaveBeenCalled();
    });

    it('should generate new OTP and send email synchronously if cooldown passed', async () => {
      User.findOne.mockResolvedValue({ name: 'John', isVerified: false });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      sendSignupOtpEmail.mockResolvedValue({});

      await resendSignupOtp({ email });

      expect(Otp.create).toHaveBeenCalled();
      expect(sendSignupOtpEmail).toHaveBeenCalledWith('john@example.com', 'John', '123456');
    });
  });

  describe('verifySignupOtp', () => {
    const payload = {
      email: 'john@example.com',
      otp: '123456',
      ip: '127.0.0.1',
      userAgent: 'test',
    };
    let mockUser;

    beforeEach(() => {
      mockUser = { _id: 'user123', isVerified: false, save: jest.fn() };
      User.findOne.mockResolvedValue(mockUser);
    });

    it('should throw 404 if user does not exist (and NOT query OTP)', async () => {
      User.findOne.mockResolvedValue(null);
      Otp.findOne.mockClear(); // Reset call count for this test

      await expect(verifySignupOtp(payload)).rejects.toThrow('User not found');

      // 👇 Proves the fail-fast optimization
      expect(Otp.findOne).not.toHaveBeenCalled();
    });

    it('should throw 400 if user is already verified (and NOT query OTP)', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });
      Otp.findOne.mockClear();

      await expect(verifySignupOtp(payload)).rejects.toThrow('User is already verified');

      // 👇 Proves the fail-fast optimization
      expect(Otp.findOne).not.toHaveBeenCalled();
    });

    it('should throw 400 if OTP record does not exist', async () => {
      Otp.findOne.mockResolvedValue(null);
      await expect(verifySignupOtp(payload)).rejects.toThrow('OTP has expired or does not exist');
    });

    it('should throw 429 immediately if already locked out, without calling bcrypt', async () => {
      Otp.findOne.mockResolvedValue({ attempts: 5 });
      bcrypt.compare.mockClear();

      await expect(verifySignupOtp(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );

      // 👇 Proves we bail out before wasting CPU on bcrypt
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should increment attempts and throw 400 on wrong OTP', async () => {
      const mockOtpRecord = { attempts: 1, save: jest.fn() };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false); // Wrong OTP

      await expect(verifySignupOtp(payload)).rejects.toThrow('You have 3 attempts remaining');
      expect(mockOtpRecord.attempts).toBe(2);
      expect(mockOtpRecord.save).toHaveBeenCalled();
    });

    it('should save the record and throw 429 when the 5th wrong attempt is made', async () => {
      // Mock a record with 4 attempts. One more wrong attempt = 5.
      const mockOtpRecord = { _id: 'otp123', attempts: 4, save: jest.fn() };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false);

      await expect(verifySignupOtp(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );

      // 👇 FIX: We now SAVE (not delete) to preserve the lockout state
      expect(mockOtpRecord.attempts).toBe(5);
      expect(mockOtpRecord.save).toHaveBeenCalled();
      expect(Otp.deleteOne).not.toHaveBeenCalled();
    });

    it('should verify user, create session, and return tokens on success', async () => {
      Otp.findOne.mockResolvedValue({ _id: 'otp123', codeHash: 'hash' });
      bcrypt.compare.mockResolvedValue(true); // Correct OTP
      Session.create.mockResolvedValue({});

      const result = await verifySignupOtp(payload);

      // Assertions
      expect(Otp.deleteOne).toHaveBeenCalledWith({ _id: 'otp123' });
      expect(mockUser.isVerified).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();

      expect(Session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'user123',
          ip: '127.0.0.1',
          userAgent: 'test',
          refreshTokenHash: 'fake-hash',
        })
      );

      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
    });
  });

  describe('loginUser', () => {
    const payload = {
      email: 'john@example.com',
      password: 'Password123!',
      ip: '127.0.0.1',
      userAgent: 'test',
    };

    it('should throw 401 if user does not exist', async () => {
      // Mock the chain: User.findOne().select()
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(loginUser(payload)).rejects.toThrow('Invalid email or password.');
    });

    it('should throw 403 if user is not verified', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ isVerified: false }) });
      await expect(loginUser(payload)).rejects.toThrow(
        'Please verify your email before logging in.'
      );
    });

    it('should throw 401 if password is incorrect', async () => {
      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({ isVerified: true, password: 'hash' }),
      });
      bcrypt.compare.mockResolvedValue(false);
      await expect(loginUser(payload)).rejects.toThrow('Invalid email or password.');
    });

    it('should create a session and return tokens on success', async () => {
      const mockUser = { _id: 'u1', isVerified: true, password: 'hash' };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      bcrypt.compare.mockResolvedValue(true);
      Session.create.mockResolvedValue({});

      const result = await loginUser(payload);

      expect(Session.create).toHaveBeenCalledWith(
        expect.objectContaining({ user: 'u1', refreshTokenHash: 'fake-hash' })
      );
      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
      expect(result.user.password).toBeUndefined(); // Ensure password is deleted
    });
  });

  // 👇 MOVED INSIDE THE MAIN DESCRIBE BLOCK
  describe('logoutUser', () => {
    const sessionId = 's1';

    it('should revoke the session and return the updated document', async () => {
      // Mock the database update
      const mockUpdatedSession = { _id: 's1', isRevoked: true };
      Session.findByIdAndUpdate.mockResolvedValue(mockUpdatedSession);

      const result = await logoutUser(sessionId);

      // Verify the correct DB query was made
      expect(Session.findByIdAndUpdate).toHaveBeenCalledWith(
        sessionId,
        { isRevoked: true },
        { new: true }
      );

      // Verify the result is returned
      expect(result).toEqual(mockUpdatedSession);
    });

    it('should throw 404 if the session is already deleted or does not exist', async () => {
      // Mock the database returning null (session not found)
      Session.findByIdAndUpdate.mockResolvedValue(null);

      await expect(logoutUser(sessionId)).rejects.toThrow(
        'Session not found or already logged out.'
      );
    });
  });
});
