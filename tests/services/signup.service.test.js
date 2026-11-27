import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/models/user.model.js', () => ({
  default: {
    findOne: jest.fn(),
    exists: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));
jest.unstable_mockModule('../../src/models/otp.model.js', () => ({
  default: {
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
    deleteOne: jest.fn(),
    create: jest.fn(),
  },
}));
jest.unstable_mockModule('../../src/models/session.model.js', () => ({
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  },
}));
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn() },
}));
jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendEmailChangeOtpEmail: jest.fn(),
}));
jest.unstable_mockModule('../../src/utils/otp.js', () => ({
  generateHashedOtp: jest.fn().mockResolvedValue({ otp: '123456', hashedOtp: 'hashed-otp' }),
}));
jest.unstable_mockModule('bcryptjs', () => ({ default: { compare: jest.fn() } }));
jest.unstable_mockModule('jsonwebtoken', () => ({ default: { verify: jest.fn() } }));
jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  generateAccessToken: jest.fn().mockReturnValue('fake-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('fake-refresh-token'),
  hashToken: jest.fn().mockReturnValue('fake-hash'),
}));
jest.unstable_mockModule('validator/lib/isStrongPassword.js', () => ({ default: jest.fn() }));
jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
const { default: User } = await import('../../src/models/user.model.js');
const { default: Otp } = await import('../../src/models/otp.model.js');
const { default: Session } = await import('../../src/models/session.model.js');
const { default: bcrypt } = await import('bcryptjs');
const { emailQueue } = await import('../../src/queues/email.queue.js');
const { sendSignupOtpEmail } = await import('../../src/services/email.service.js');
const {
  requestSignupOtp,
  isUsernameAvailable,
  isEmailAvailable,
  resendSignupOtp,
  verifySignupOtp,
} = await import('../../src/services/signup.service.js');
const inMinutes = (n) => new Date(Date.now() + n * 60 * 1000);
describe('signup.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isUsernameAvailable', () => {
    it('returns false when a verified user owns the username', async () => {
      User.exists.mockResolvedValue({ _id: 'existing-id' });

      await expect(isUsernameAvailable({ username: 'john' })).resolves.toBe(false);
      expect(User.exists).toHaveBeenCalledWith({ username: 'john', isVerified: true });
    });

    it('returns true when no verified user owns the username', async () => {
      User.exists.mockResolvedValue(null);

      await expect(isUsernameAvailable({ username: 'john' })).resolves.toBe(true);
    });
  });

  describe('isEmailAvailable', () => {
    it('returns false when a verified user owns the email', async () => {
      User.exists.mockResolvedValue({ _id: 'existing-id' });

      await expect(isEmailAvailable({ email: 'john@example.com' })).resolves.toBe(false);
      expect(User.exists).toHaveBeenCalledWith({
        email: 'john@example.com',
        isVerified: true,
      });
    });

    it('returns true when no verified user owns the email', async () => {
      User.exists.mockResolvedValue(null);

      await expect(isEmailAvailable({ email: 'john@example.com' })).resolves.toBe(true);
    });
  });

  describe('requestSignupOtp', () => {
    const payload = {
      username: 'john',
      email: 'john@example.com',
      password: 'Password123!',
    };

    it('should throw 409 if user exists and is already verified', async () => {
      User.findOne
        .mockResolvedValueOnce({
          email: payload.email,
          username: payload.username,
          isVerified: true,
        })
        .mockResolvedValueOnce({
          email: payload.email,
          username: payload.username,
          isVerified: true,
        });

      await expect(requestSignupOtp(payload)).rejects.toThrow(
        'An account with this email already exists. Please log in.'
      );
      expect(User.findOne).toHaveBeenNthCalledWith(1, { email: payload.email });
      expect(User.findOne).toHaveBeenNthCalledWith(2, { username: payload.username });
      expect(User.create).not.toHaveBeenCalled();
    });

    it.each([
      ['same username', payload.username],
      ['different username', 'old-name'],
      ['no username', undefined],
    ])(
      'should replace an unverified same-email account with %s',
      async (_usernameCase, existingUsername) => {
        User.findOne
          .mockResolvedValueOnce({
            _id: 'old-id',
            email: payload.email,
            username: existingUsername,
            isVerified: false,
          })
          .mockResolvedValueOnce(
            existingUsername === payload.username
              ? {
                  _id: 'old-id',
                  email: payload.email,
                  username: existingUsername,
                  isVerified: false,
                }
              : null
          );
        User.deleteMany.mockResolvedValue({});
        User.create.mockResolvedValue({ _id: 'new-id' });
        Otp.deleteMany.mockResolvedValue({});
        Otp.create.mockResolvedValue({});
        emailQueue.add.mockResolvedValue({});

        await requestSignupOtp(payload);

        expect(User.deleteMany).toHaveBeenCalledWith({
          _id: { $in: ['old-id', ...(existingUsername === payload.username ? ['old-id'] : [])] },
          isVerified: false,
        });
        expect(User.create).toHaveBeenCalledWith(expect.objectContaining(payload));
        expect(Otp.deleteMany).toHaveBeenCalledWith({ email: payload.email, purpose: 'signup' });
        expect(Otp.create).toHaveBeenCalledWith({
          email: payload.email,
          codeHash: 'hashed-otp',
          expiresAt: expect.any(Date),
          purpose: 'signup',
        });
        expect(emailQueue.add).toHaveBeenCalledWith('send-otp', {
          email: 'john@example.com',
          username: 'john',
          otp: '123456',
        });
      }
    );

    it('should replace a username owned by another pending account', async () => {
      User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        _id: 'pending-id',
        email: 'other@example.com',
        username: payload.username,
        isVerified: false,
      });
      User.deleteMany.mockResolvedValue({});
      User.create.mockResolvedValue({ _id: 'new-id' });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      emailQueue.add.mockResolvedValue({});

      await requestSignupOtp(payload);

      expect(User.deleteMany).toHaveBeenCalledWith({
        _id: { $in: ['pending-id'] },
        isVerified: false,
      });
      expect(User.create).toHaveBeenCalledWith(expect.objectContaining(payload));
    });

    it('should reject a username already used by a verified account', async () => {
      User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        email: 'other@example.com',
        username: payload.username,
        isVerified: true,
      });

      await expect(requestSignupOtp(payload)).rejects.toThrow(
        'An account with this username already exists. Please choose another username.'
      );
      expect(User.deleteMany).not.toHaveBeenCalled();
      expect(User.create).not.toHaveBeenCalled();
    });
  });

  describe('resendSignupOtp', () => {
    const email = 'john@example.com';

    it('should throw 404 if user does not exist', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(resendSignupOtp({ email })).rejects.toThrow('User not found');
    });

    it('should throw 400 if user is already verified', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });
      await expect(resendSignupOtp({ email })).rejects.toThrow('Account is already verified');
    });

    it('should throw 429 if the cooldown (20s) has not passed', async () => {
      User.findOne.mockResolvedValue({ isVerified: false });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

      await expect(resendSignupOtp({ email })).rejects.toThrow(/Please wait \d+ seconds/);
      expect(sendSignupOtpEmail).not.toHaveBeenCalled();
    });

    it('should generate new OTP and send email synchronously if cooldown passed', async () => {
      User.findOne.mockResolvedValue({ username: 'john', isVerified: false });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      sendSignupOtpEmail.mockResolvedValue({});

      await resendSignupOtp({ email });

      expect(Otp.create).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'signup' }));
      expect(sendSignupOtpEmail).toHaveBeenCalledWith('john@example.com', 'john', '123456');
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
      Otp.findOne.mockClear();

      await expect(verifySignupOtp(payload)).rejects.toThrow('User not found');
      expect(Otp.findOne).not.toHaveBeenCalled();
    });

    it('should throw 400 if user is already verified', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });
      Otp.findOne.mockClear();

      await expect(verifySignupOtp(payload)).rejects.toThrow('User is already verified');
      expect(Otp.findOne).not.toHaveBeenCalled();
    });

    it('should throw 400 if OTP record does not exist', async () => {
      Otp.findOne.mockResolvedValue(null);
      await expect(verifySignupOtp(payload)).rejects.toThrow('OTP has expired or does not exist');
    });

    it('should throw 400 if OTP record exists but has expired', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(verifySignupOtp(payload)).rejects.toThrow('OTP has expired or does not exist');
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw 429 immediately if already locked out, without calling bcrypt', async () => {
      Otp.findOne.mockResolvedValue({ attempts: 5, expiresAt: inMinutes(5) });
      bcrypt.compare.mockClear();

      await expect(verifySignupOtp(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should increment attempts and throw 400 on wrong OTP', async () => {
      const mockOtpRecord = { attempts: 1, expiresAt: inMinutes(5), save: jest.fn() };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false);

      await expect(verifySignupOtp(payload)).rejects.toThrow('You have 3 attempts remaining');
      expect(mockOtpRecord.attempts).toBe(2);
      expect(mockOtpRecord.save).toHaveBeenCalled();
    });

    it('should save the record and throw 429 when the 5th wrong attempt is made', async () => {
      const mockOtpRecord = {
        _id: 'otp123',
        attempts: 4,
        expiresAt: inMinutes(5),
        save: jest.fn(),
      };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false);

      await expect(verifySignupOtp(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );
      expect(mockOtpRecord.attempts).toBe(5);
      expect(mockOtpRecord.save).toHaveBeenCalled();
      expect(Otp.deleteOne).not.toHaveBeenCalled();
    });

    it('should verify user, create session, and return tokens on success', async () => {
      Otp.findOne.mockResolvedValue({ _id: 'otp123', codeHash: 'hash', expiresAt: inMinutes(5) });
      bcrypt.compare.mockResolvedValue(true);
      Session.create.mockResolvedValue({});

      const result = await verifySignupOtp(payload);

      expect(Otp.deleteOne).toHaveBeenCalledWith({ _id: 'otp123', purpose: 'signup' });
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
});
