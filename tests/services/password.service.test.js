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
const { logger } = await import('../../src/config/logger.js');
const { changePassword, requestPasswordReset, resetPassword } =
  await import('../../src/services/password.service.js');
const inMinutes = (n) => new Date(Date.now() + n * 60 * 1000);
describe('password.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('changePassword', () => {
    const payload = {
      userId: 'u1',
      currentSessionId: 's1',
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
    };
    let mockUser;
    let selectMock;

    beforeEach(() => {
      mockUser = { _id: 'u1', email: 'test@example.com', password: 'hashed-old', save: jest.fn() };
      selectMock = jest.fn().mockResolvedValue(mockUser);
      User.findById.mockReturnValue({ select: selectMock });
    });

    it('should select +password field', async () => {
      bcrypt.compare.mockResolvedValue(true);
      Session.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await changePassword(payload);

      expect(selectMock).toHaveBeenCalledWith('+password');
    });

    it('should throw 401 if user not found', async () => {
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(changePassword(payload)).rejects.toThrow('Session is no longer valid');
    });

    it('should throw 401 on wrong current password', async () => {
      bcrypt.compare.mockResolvedValue(false);
      await expect(changePassword(payload)).rejects.toThrow('Current password is incorrect.');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should throw 400 if new password equals current', async () => {
      bcrypt.compare.mockResolvedValue(true);
      await expect(
        changePassword({ ...payload, newPassword: payload.currentPassword })
      ).rejects.toThrow('New password must be different');
    });

    it('should update password and revoke other sessions on success', async () => {
      bcrypt.compare.mockResolvedValue(true);
      Session.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await changePassword(payload);

      expect(mockUser.password).toBe('NewPassword456!');
      expect(mockUser.save).toHaveBeenCalled();
      expect(Session.updateMany).toHaveBeenCalledWith(
        { user: 'u1', _id: { $ne: 's1' }, isRevoked: false },
        expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) })
      );
      expect(result).toEqual({ revokedCount: 2 });
    });
  });

  describe('requestPasswordReset', () => {
    const email = 'john@example.com';

    it('should return silently if user does not exist (anti-enumeration)', async () => {
      User.findOne.mockResolvedValue(null);
      Otp.findOne.mockClear();
      emailQueue.add.mockClear();

      const result = await requestPasswordReset({ email });

      expect(result).toBeUndefined();
      expect(Otp.findOne).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('non-existent or unverified')
      );
    });

    it('should return silently if user is unverified (anti-enumeration)', async () => {
      User.findOne.mockResolvedValue({ isVerified: false });
      Otp.findOne.mockClear();
      emailQueue.add.mockClear();

      const result = await requestPasswordReset({ email });

      expect(result).toBeUndefined();
      expect(Otp.findOne).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should throw 429 if cooldown active', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

      await expect(requestPasswordReset({ email })).rejects.toThrow(/Please wait \d+ seconds/);
    });

    it('should queue send-reset-otp on success', async () => {
      User.findOne.mockResolvedValue({ name: 'John', isVerified: true });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      emailQueue.add.mockResolvedValue({});

      await requestPasswordReset({ email });

      expect(Otp.deleteMany).toHaveBeenCalledWith({ email, purpose: 'reset' });
      expect(emailQueue.add).toHaveBeenCalledWith('send-reset-otp', {
        email,
        name: 'John',
        otp: '123456',
      });
    });
  });

  describe('resetPassword', () => {
    const payload = { email: 'john@example.com', otp: '123456', newPassword: 'NewPassword123!' };
    let mockUser;

    beforeEach(() => {
      mockUser = { _id: 'u1', save: jest.fn() };
      User.findOne.mockResolvedValue(mockUser);
    });

    it('should throw 400 if user does not exist', async () => {
      User.findOne.mockResolvedValue(null);
      await expect(resetPassword(payload)).rejects.toThrow('Invalid request.');
    });

    it('should throw 400 if OTP record does not exist', async () => {
      Otp.findOne.mockResolvedValue(null);
      await expect(resetPassword(payload)).rejects.toThrow('OTP has expired or does not exist');
    });

    it('should query OTP with purpose "reset"', async () => {
      Otp.findOne.mockResolvedValue(null);
      await expect(resetPassword(payload)).rejects.toThrow('OTP has expired');
      expect(Otp.findOne).toHaveBeenCalledWith({ email: 'john@example.com', purpose: 'reset' });
    });

    it('should throw 400 if OTP expired', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(resetPassword(payload)).rejects.toThrow('OTP has expired');
      expect(Otp.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('should throw 429 if already locked out', async () => {
      Otp.findOne.mockResolvedValue({ attempts: 5, expiresAt: inMinutes(5) });
      await expect(resetPassword(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );
    });

    it('should increment attempts on wrong OTP', async () => {
      const mockOtpRecord = { attempts: 1, expiresAt: inMinutes(5), save: jest.fn() };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false);

      await expect(resetPassword(payload)).rejects.toThrow('You have 3 attempts remaining');
      expect(mockOtpRecord.attempts).toBe(2);
    });

    it('should throw 400 if OTP was already consumed', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: inMinutes(5),
      });
      bcrypt.compare.mockResolvedValue(true);
      Otp.findOneAndDelete.mockResolvedValue(null);

      await expect(resetPassword(payload)).rejects.toThrow('OTP has already been used');
      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('should update password and revoke ALL sessions on success', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: inMinutes(5),
      });
      bcrypt.compare.mockResolvedValue(true);
      Otp.findOneAndDelete.mockResolvedValue({ _id: 'otp123' });
      Session.updateMany.mockResolvedValue({});

      await resetPassword(payload);

      expect(Otp.findOneAndDelete).toHaveBeenCalledWith({ _id: 'otp123', purpose: 'reset' });
      expect(mockUser.password).toBe('NewPassword123!');
      expect(mockUser.save).toHaveBeenCalled();
      expect(Session.updateMany).toHaveBeenCalledWith(
        { user: 'u1' },
        expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) })
      );
    });
  });
});
