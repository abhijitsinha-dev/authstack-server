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
const { sendEmailChangeOtpEmail } = await import('../../src/services/email.service.js');
const { requestEmailChange, verifyEmailChange } =
  await import('../../src/services/email-change.service.js');
const inMinutes = (n) => new Date(Date.now() + n * 60 * 1000);
describe('email-change.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestEmailChange', () => {
    const payload = {
      userId: 'u1',
      newEmail: 'new@example.com',
      currentPassword: 'OldPassword123!',
    };
    let mockUser;
    let selectMock;

    beforeEach(() => {
      mockUser = {
        _id: 'u1',
        email: 'old@example.com',
        name: 'John',
        password: 'hashed-old',
        save: jest.fn(),
      };
      selectMock = jest.fn().mockResolvedValue(mockUser);
      User.findById.mockReturnValue({ select: selectMock });
    });

    it('should select +password field', async () => {
      bcrypt.compare.mockResolvedValue(true);
      User.findOne.mockResolvedValue(null);
      Otp.findOne.mockResolvedValue(null);
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      sendEmailChangeOtpEmail.mockResolvedValue({});

      await requestEmailChange(payload);

      expect(selectMock).toHaveBeenCalledWith('+password');
    });

    it('should throw 401 if user not found', async () => {
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(requestEmailChange(payload)).rejects.toThrow('Session is no longer valid');
    });

    it('should throw 401 on wrong current password', async () => {
      bcrypt.compare.mockResolvedValue(false);
      await expect(requestEmailChange(payload)).rejects.toThrow('Current password is incorrect.');
      expect(Otp.create).not.toHaveBeenCalled();
    });

    it('should throw 400 if new email equals current email', async () => {
      bcrypt.compare.mockResolvedValue(true);
      await expect(requestEmailChange({ ...payload, newEmail: 'old@example.com' })).rejects.toThrow(
        'New email must be different from current email.'
      );
    });

    it('should throw 409 if new email is already taken', async () => {
      bcrypt.compare.mockResolvedValue(true);
      User.findOne.mockResolvedValue({ _id: 'other-user', email: 'new@example.com' });

      await expect(requestEmailChange(payload)).rejects.toThrow('This email is already in use.');
      expect(Otp.create).not.toHaveBeenCalled();
    });

    it('should throw 429 if the cooldown has not passed', async () => {
      bcrypt.compare.mockResolvedValue(true);
      User.findOne.mockResolvedValue(null);
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

      await expect(requestEmailChange(payload)).rejects.toThrow(/Please wait \d+ seconds/);
      expect(sendEmailChangeOtpEmail).not.toHaveBeenCalled();
    });

    it('should create OTP and send email synchronously on success', async () => {
      bcrypt.compare.mockResolvedValue(true);
      User.findOne.mockResolvedValue(null);
      Otp.findOne.mockResolvedValue(null);
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      sendEmailChangeOtpEmail.mockResolvedValue({});

      await requestEmailChange(payload);

      expect(Otp.deleteMany).toHaveBeenCalledWith({ userId: 'u1', purpose: 'email-change' });
      expect(Otp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          email: 'new@example.com',
          purpose: 'email-change',
          codeHash: 'hashed-otp',
        })
      );
      expect(sendEmailChangeOtpEmail).toHaveBeenCalledWith('new@example.com', 'John', '123456');
    });
  });

  describe('verifyEmailChange', () => {
    const payload = {
      userId: 'u1',
      currentSessionId: 's1',
      newEmail: 'new@example.com',
      otp: '123456',
    };
    let mockUser;

    beforeEach(() => {
      mockUser = { _id: 'u1', email: 'old@example.com', save: jest.fn() };
      User.findById.mockResolvedValue(mockUser);
    });

    it('should throw 401 if user not found', async () => {
      User.findById.mockResolvedValue(null);
      await expect(verifyEmailChange(payload)).rejects.toThrow('Session is no longer valid');
    });

    it('should throw 400 if new email equals current email', async () => {
      await expect(verifyEmailChange({ ...payload, newEmail: 'old@example.com' })).rejects.toThrow(
        'New email must be different from current email.'
      );
    });

    it('should throw 400 if OTP record does not exist', async () => {
      Otp.findOne.mockResolvedValue(null);
      await expect(verifyEmailChange(payload)).rejects.toThrow('OTP has expired or does not exist');
    });

    it('should throw 400 if OTP has expired', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(verifyEmailChange(payload)).rejects.toThrow('OTP has expired or does not exist');
    });

    it('should throw 429 if locked out, without calling bcrypt', async () => {
      Otp.findOne.mockResolvedValue({ attempts: 5, expiresAt: inMinutes(5) });
      bcrypt.compare.mockClear();
      await expect(verifyEmailChange(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should increment attempts and throw 400 on wrong OTP', async () => {
      const mockOtpRecord = { attempts: 1, expiresAt: inMinutes(5), save: jest.fn() };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false);

      await expect(verifyEmailChange(payload)).rejects.toThrow('You have 3 attempts remaining');
      expect(mockOtpRecord.attempts).toBe(2);
      expect(mockOtpRecord.save).toHaveBeenCalled();
    });

    it('should throw 400 if OTP was already consumed (concurrent request)', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: inMinutes(5),
      });
      bcrypt.compare.mockResolvedValue(true);
      Otp.findOneAndDelete.mockResolvedValue(null);

      await expect(verifyEmailChange(payload)).rejects.toThrow('OTP has already been used');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should throw 409 if new email was claimed during the OTP window', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: inMinutes(5),
      });
      bcrypt.compare.mockResolvedValue(true);
      Otp.findOneAndDelete.mockResolvedValue({ _id: 'otp123' });
      User.findOne.mockResolvedValue({ _id: 'other-user', email: 'new@example.com' });

      await expect(verifyEmailChange(payload)).rejects.toThrow('This email is already in use.');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should update email, save, and revoke other sessions on success', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: inMinutes(5),
      });
      bcrypt.compare.mockResolvedValue(true);
      Otp.findOneAndDelete.mockResolvedValue({ _id: 'otp123' });
      User.findOne.mockResolvedValue(null);
      Session.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await verifyEmailChange(payload);

      expect(mockUser.email).toBe('new@example.com');
      expect(mockUser.save).toHaveBeenCalled();
      expect(Otp.findOneAndDelete).toHaveBeenCalledWith({ _id: 'otp123', purpose: 'email-change' });
      expect(Session.updateMany).toHaveBeenCalledWith(
        { user: 'u1', _id: { $ne: 's1' }, isRevoked: false },
        expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) })
      );
      expect(result).toEqual({ revokedCount: 2 });
    });
  });
});
