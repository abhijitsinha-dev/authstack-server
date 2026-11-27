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
const { default: Session } = await import('../../src/models/session.model.js');
const { default: bcrypt } = await import('bcryptjs');
const { default: jwt } = await import('jsonwebtoken');
const { default: isStrongPassword } = await import('validator/lib/isStrongPassword.js');
const {
  loginUser,
  logoutUser,
  refreshTokens,
  getCurrentUser,
  listUserSessions,
  revokeSession,
  revokeOtherSessions,
} = await import('../../src/services/session.service.js');
const buildFindChain = (sessions) => {
  const chain = { sort: jest.fn(), select: jest.fn(), lean: jest.fn().mockResolvedValue(sessions) };
  chain.sort.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
};
describe('session.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loginUser', () => {
    const payload = {
      email: 'john@example.com',
      password: 'Password123!',
      ip: '127.0.0.1',
      userAgent: 'test',
    };

    beforeEach(() => {
      isStrongPassword.mockReturnValue(true);
    });

    it('should fast-fail with 401 if password is weak, without querying the database', async () => {
      isStrongPassword.mockReturnValue(false);
      User.findOne.mockClear();

      await expect(loginUser({ ...payload, password: 'weak' })).rejects.toThrow(
        'Invalid email or password.'
      );
      expect(User.findOne).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw 401 if user does not exist', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await expect(loginUser(payload)).rejects.toThrow('Invalid email or password.');
    });

    it('should throw 403 if user is not verified', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ isVerified: false }) });
      await expect(loginUser(payload)).rejects.toThrow('Please verify your email');
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
      expect(result.user.password).toBeUndefined();
    });
  });

  describe('refreshTokens', () => {
    const validToken = 'valid-refresh-token';
    const decodedPayload = { sub: 'u1', sid: 's1' };

    it('should throw 401 if no token is provided', async () => {
      await expect(refreshTokens({})).rejects.toThrow('No refresh token provided');
    });

    it('should throw 401 if jwt.verify fails', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });
      await expect(refreshTokens({ refreshToken: 'bad' })).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });

    it('should throw 401 if the session does not exist', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      Session.findById.mockResolvedValue(null);
      await expect(refreshTokens({ refreshToken: validToken })).rejects.toThrow(
        'Session has been revoked or expired'
      );
    });

    it('should throw 401 if the session is already revoked', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      Session.findById.mockResolvedValue({ isRevoked: true });
      await expect(refreshTokens({ refreshToken: validToken })).rejects.toThrow(
        'Session has been revoked or expired'
      );
    });

    it('should detect reuse, revoke the session, and throw 401', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      const mockSession = {
        isRevoked: false,
        refreshTokenHash: 'hash-of-a-different-token',
        save: jest.fn(),
      };
      Session.findById.mockResolvedValue(mockSession);

      await expect(refreshTokens({ refreshToken: validToken })).rejects.toThrow(
        'Refresh token reuse detected'
      );
      expect(mockSession.isRevoked).toBe(true);
      expect(mockSession.revokedAt).toBeInstanceOf(Date);
      expect(mockSession.save).toHaveBeenCalled();
    });

    it('should rotate tokens and update the stored hash on success', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      const mockSession = { isRevoked: false, refreshTokenHash: 'fake-hash', save: jest.fn() };
      Session.findById.mockResolvedValue(mockSession);

      const before = Date.now();
      const result = await refreshTokens({ refreshToken: validToken });
      const after = Date.now();

      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
      expect(mockSession.save).toHaveBeenCalled();
      expect(mockSession.lastUsedAt).toBeInstanceOf(Date);
      expect(mockSession.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(mockSession.lastUsedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should set lastUsedAt on legacy sessions that predate the field', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      const mockSession = { isRevoked: false, refreshTokenHash: 'fake-hash', save: jest.fn() };
      Session.findById.mockResolvedValue(mockSession);

      await refreshTokens({ refreshToken: validToken });

      expect(mockSession.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  describe('getCurrentUser', () => {
    it('should return the user document when found', async () => {
      const mockUser = { _id: 'u1', name: 'John', email: 'j@example.com', role: 'user' };
      User.findById.mockResolvedValue(mockUser);

      const result = await getCurrentUser({ userId: 'u1' });
      expect(User.findById).toHaveBeenCalledWith('u1');
      expect(result).toBe(mockUser);
    });

    it('should throw 401 if the user no longer exists', async () => {
      User.findById.mockResolvedValue(null);
      await expect(getCurrentUser({ userId: 'deleted-user' })).rejects.toThrow(
        'Session is no longer valid'
      );
    });
  });

  describe('logoutUser', () => {
    it('should revoke the session with revokedAt', async () => {
      const mockUpdatedSession = { _id: 's1', isRevoked: true };
      Session.findByIdAndUpdate.mockResolvedValue(mockUpdatedSession);

      const result = await logoutUser('s1');

      expect(Session.findByIdAndUpdate).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ isRevoked: true, revokedAt: expect.any(Date) }),
        { returnDocument: 'after' }
      );
      expect(result).toEqual(mockUpdatedSession);
    });

    it('should throw 404 if the session does not exist', async () => {
      Session.findByIdAndUpdate.mockResolvedValue(null);
      await expect(logoutUser('s1')).rejects.toThrow('Session not found');
    });
  });

  describe('listUserSessions', () => {
    it('should map sessions and mark the current one', async () => {
      const mockSessions = [
        {
          _id: 's1',
          ip: '127.0.0.1',
          userAgent: 'Mozilla',
          createdAt: new Date('2026-11-14T10:00:00Z'),
          lastUsedAt: new Date('2026-11-14T12:00:00Z'),
        },
        {
          _id: 's2',
          ip: '203.0.113.1',
          userAgent: 'iPhone',
          createdAt: new Date('2026-11-13T10:00:00Z'),
          lastUsedAt: new Date('2026-11-13T10:00:00Z'),
        },
      ];
      Session.find.mockReturnValue(buildFindChain(mockSessions));

      const result = await listUserSessions({ userId: 'u1', currentSessionId: 's1' });

      expect(result).toHaveLength(2);
      expect(result[0].isCurrent).toBe(true);
      expect(result[1].isCurrent).toBe(false);
    });

    it('should filter out revoked and expired sessions in the query', async () => {
      const chain = buildFindChain([]);
      Session.find.mockReturnValue(chain);

      await listUserSessions({ userId: 'u1', currentSessionId: 's1' });

      const filter = Session.find.mock.calls[0][0];
      expect(filter.user).toBe('u1');
      expect(filter.isRevoked).toBe(false);
      expect(filter.expiresAt).toEqual({ $gt: expect.any(Date) });
      expect(chain.select).toHaveBeenCalledWith('-refreshTokenHash -__v');
    });
  });

  describe('revokeSession', () => {
    it('should throw 400 if trying to revoke the current session', async () => {
      await expect(
        revokeSession({ sessionId: 's1', userId: 'u1', currentSessionId: 's1' })
      ).rejects.toThrow('Cannot revoke the current session');
      expect(Session.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should throw 404 if the session does not exist', async () => {
      Session.findOneAndUpdate.mockResolvedValue(null);
      await expect(
        revokeSession({ sessionId: 's2', userId: 'u1', currentSessionId: 's1' })
      ).rejects.toThrow('Session not found');
    });

    it('should scope the query by userId to prevent IDOR', async () => {
      Session.findOneAndUpdate.mockResolvedValue({ _id: 's2', isRevoked: true });
      await revokeSession({ sessionId: 's2', userId: 'u1', currentSessionId: 's1' });

      const filter = Session.findOneAndUpdate.mock.calls[0][0];
      expect(filter.user).toBe('u1');
      expect(filter._id).toBe('s2');
    });
  });

  describe('revokeOtherSessions', () => {
    it('should return the count and exclude current session', async () => {
      Session.updateMany.mockResolvedValue({ modifiedCount: 3 });
      const result = await revokeOtherSessions({ userId: 'u1', currentSessionId: 's1' });

      const filter = Session.updateMany.mock.calls[0][0];
      expect(filter._id).toEqual({ $ne: 's1' });
      expect(result).toEqual({ revokedCount: 3 });
    });

    it('should succeed with revokedCount 0 when no other sessions exist', async () => {
      Session.updateMany.mockResolvedValue({ modifiedCount: 0 });
      const result = await revokeOtherSessions({ userId: 'u1', currentSessionId: 's1' });
      expect(result.revokedCount).toBe(0);
    });
  });
});
