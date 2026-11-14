import { jest } from '@jest/globals';

// ─────────────────────────────────────────────
// 1. MOCK ALL DEPENDENCIES
// ─────────────────────────────────────────────

jest.unstable_mockModule('../../src/models/user.model.js', () => ({
  default: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/models/otp.model.js', () => ({
  default: {
    findOne: jest.fn(),
    findOneAndDelete: jest.fn(),
    deleteMany: jest.fn(),
    deleteOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/models/session.model.js', () => ({
  default: {
    create: jest.fn(),
    find: jest.fn(), // 👈 NEW — listUserSessions
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(), // 👈 NEW — revokeSession
    updateMany: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  emailQueue: { add: jest.fn() },
}));

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  sendSignupOtpEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/otp.js', () => ({
  generateHashedOtp: jest.fn().mockResolvedValue({ otp: '123456', hashedOtp: 'hashed-otp' }),
}));

jest.unstable_mockModule('bcryptjs', () => ({
  default: { compare: jest.fn() },
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { verify: jest.fn() },
}));

jest.unstable_mockModule('../../src/utils/jwt.js', () => ({
  generateAccessToken: jest.fn().mockReturnValue('fake-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('fake-refresh-token'),
  hashToken: jest.fn().mockReturnValue('fake-hash'),
}));

jest.unstable_mockModule('validator/lib/isStrongPassword.js', () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ─────────────────────────────────────────────
// 2. DYNAMIC IMPORTS
// ─────────────────────────────────────────────
const { default: User } = await import('../../src/models/user.model.js');
const { default: Otp } = await import('../../src/models/otp.model.js');
const { default: Session } = await import('../../src/models/session.model.js');
const { default: bcrypt } = await import('bcryptjs');
const { default: jwt } = await import('jsonwebtoken');
const { default: isStrongPassword } = await import('validator/lib/isStrongPassword.js');
const { emailQueue } = await import('../../src/queues/email.queue.js');
const { sendSignupOtpEmail } = await import('../../src/services/email.service.js');
const { logger } = await import('../../src/config/logger.js');
const {
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  loginUser,
  logoutUser,
  refreshTokens,
  getCurrentUser,
  // 👇 NEW
  listUserSessions,
  revokeSession,
  revokeOtherSessions,
  requestPasswordReset,
  resetPassword,
} = await import('../../src/services/auth.service.js');

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const inMinutes = (n) => new Date(Date.now() + n * 60 * 1000);

// Builds a mock matching Mongoose's `find().sort().select().lean()` chain.
// Exposing the inner mocks lets tests assert on sort/select arguments.
const buildFindChain = (sessions) => {
  const chain = {
    sort: jest.fn(),
    select: jest.fn(),
    lean: jest.fn().mockResolvedValue(sessions),
  };
  chain.sort.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
};

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
      expect(Otp.deleteMany).toHaveBeenCalledWith({ email: 'john@example.com', purpose: 'signup' });
      expect(Otp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john@example.com',
          codeHash: 'hashed-otp',
          purpose: 'signup',
        })
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

      expect(Otp.create).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'signup' }));
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
      Otp.findOne.mockClear();

      await expect(verifySignupOtp(payload)).rejects.toThrow('User not found');
      expect(Otp.findOne).not.toHaveBeenCalled();
    });

    it('should throw 400 if user is already verified (and NOT query OTP)', async () => {
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
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        expiresAt: inMinutes(5),
      });
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
      expect(result.user.password).toBeUndefined();
    });
  });

  describe('refreshTokens', () => {
    const validToken = 'valid-refresh-token';
    const decodedPayload = { sub: 'u1', sid: 's1' };

    it('should throw 401 if no token is provided', async () => {
      await expect(refreshTokens({})).rejects.toThrow('No refresh token provided');
    });

    it('should throw 401 if jwt.verify fails (malformed/expired)', async () => {
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

    it('should rotate tokens, update the hash, and set lastUsedAt on success', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      const mockSession = {
        isRevoked: false,
        refreshTokenHash: 'fake-hash',
        save: jest.fn(),
      };
      Session.findById.mockResolvedValue(mockSession);

      const before = Date.now();
      const result = await refreshTokens({ refreshToken: validToken });
      const after = Date.now();

      expect(result.accessToken).toBe('fake-access-token');
      expect(result.refreshToken).toBe('fake-refresh-token');
      expect(mockSession.save).toHaveBeenCalled();
      expect(mockSession.isRevoked).toBe(false);

      expect(mockSession.lastUsedAt).toBeInstanceOf(Date);
      expect(mockSession.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(mockSession.lastUsedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('should advance lastUsedAt on every refresh (no throttle)', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      const recentTimestamp = new Date(Date.now() - 2 * 60 * 1000);
      const mockSession = {
        isRevoked: false,
        refreshTokenHash: 'fake-hash',
        lastUsedAt: recentTimestamp,
        save: jest.fn(),
      };
      Session.findById.mockResolvedValue(mockSession);

      await refreshTokens({ refreshToken: validToken });

      expect(mockSession.lastUsedAt).not.toBe(recentTimestamp);
      expect(mockSession.lastUsedAt.getTime()).toBeGreaterThan(recentTimestamp.getTime());
    });

    it('should set lastUsedAt on legacy sessions that predate the field', async () => {
      jwt.verify.mockReturnValue(decodedPayload);
      const mockSession = {
        isRevoked: false,
        refreshTokenHash: 'fake-hash',
        // lastUsedAt: undefined (legacy)
        save: jest.fn(),
      };
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

    it('should throw 401 if the user no longer exists (stale session)', async () => {
      User.findById.mockResolvedValue(null);

      await expect(getCurrentUser({ userId: 'deleted-user' })).rejects.toThrow(
        'Session is no longer valid. Please log in again.'
      );
    });
  });

  describe('logoutUser', () => {
    const sessionId = 's1';

    it('should revoke the session with revokedAt and return the updated document', async () => {
      const mockUpdatedSession = { _id: 's1', isRevoked: true };
      Session.findByIdAndUpdate.mockResolvedValue(mockUpdatedSession);

      const result = await logoutUser(sessionId);

      expect(Session.findByIdAndUpdate).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        }),
        { returnDocument: 'after' }
      );

      expect(result).toEqual(mockUpdatedSession);
    });

    it('should throw 404 if the session is already deleted or does not exist', async () => {
      Session.findByIdAndUpdate.mockResolvedValue(null);

      await expect(logoutUser(sessionId)).rejects.toThrow(
        'Session not found or already logged out.'
      );
    });
  });

  // ─────────────────────────────────────────────
  // NEW: listUserSessions
  // ─────────────────────────────────────────────
  describe('listUserSessions', () => {
    const userId = 'u1';
    const currentSessionId = 's1';

    it('should map sessions and mark the current one with isCurrent: true', async () => {
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

      const result = await listUserSessions({ userId, currentSessionId });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 's1',
        ip: '127.0.0.1',
        userAgent: 'Mozilla',
        createdAt: new Date('2026-11-14T10:00:00Z'),
        lastUsedAt: new Date('2026-11-14T12:00:00Z'),
        isCurrent: true,
      });
      expect(result[1].id).toBe('s2');
      expect(result[1].isCurrent).toBe(false);
    });

    it('should filter out revoked and expired sessions in the query', async () => {
      const chain = buildFindChain([]);
      Session.find.mockReturnValue(chain);

      await listUserSessions({ userId, currentSessionId });

      const filter = Session.find.mock.calls[0][0];
      expect(filter.user).toBe(userId);
      expect(filter.isRevoked).toBe(false);
      expect(filter.expiresAt).toEqual({ $gt: expect.any(Date) });

      // sorted by most recently used, selects without the hash
      expect(chain.sort).toHaveBeenCalledWith({ lastUsedAt: -1 });
      expect(chain.select).toHaveBeenCalledWith('-refreshTokenHash -__v');
      expect(chain.lean).toHaveBeenCalled();
    });

    it('should return an empty array when the user has no sessions', async () => {
      Session.find.mockReturnValue(buildFindChain([]));

      const result = await listUserSessions({ userId, currentSessionId });

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // NEW: revokeSession
  // ─────────────────────────────────────────────
  describe('revokeSession', () => {
    const sessionId = 's2';
    const userId = 'u1';
    const currentSessionId = 's1';

    it('should throw 400 if trying to revoke the current session (without a DB call)', async () => {
      await expect(
        revokeSession({ sessionId: currentSessionId, userId, currentSessionId })
      ).rejects.toThrow('Cannot revoke the current session');

      // Proves the guard short-circuits before hitting the DB
      expect(Session.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should throw 404 if the session does not exist (or belongs to another user)', async () => {
      Session.findOneAndUpdate.mockResolvedValue(null);

      await expect(revokeSession({ sessionId, userId, currentSessionId })).rejects.toThrow(
        'Session not found'
      );
    });

    // 🚨 SECURITY: the IDOR-prevention test — this is the most important one in this block
    it('should scope the query by userId to prevent IDOR', async () => {
      Session.findOneAndUpdate.mockResolvedValue({ _id: 's2', isRevoked: true });

      await revokeSession({ sessionId, userId, currentSessionId });

      const filter = Session.findOneAndUpdate.mock.calls[0][0];
      // Without `user: userId`, any authenticated user could revoke anyone's session
      expect(filter.user).toBe(userId);
      expect(filter._id).toBe(sessionId);
      expect(filter.isRevoked).toBe(false);
      expect(filter.expiresAt).toEqual({ $gt: expect.any(Date) });
    });

    it('should return the revoked session on success', async () => {
      const mockRevoked = { _id: 's2', isRevoked: true, revokedAt: new Date() };
      Session.findOneAndUpdate.mockResolvedValue(mockRevoked);

      const result = await revokeSession({ sessionId, userId, currentSessionId });

      expect(result).toBe(mockRevoked);
    });
  });

  // ─────────────────────────────────────────────
  // NEW: revokeOtherSessions
  // ─────────────────────────────────────────────
  describe('revokeOtherSessions', () => {
    const userId = 'u1';
    const currentSessionId = 's1';

    it('should return the count of revoked sessions', async () => {
      Session.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await revokeOtherSessions({ userId, currentSessionId });

      expect(result).toEqual({ revokedCount: 3 });
    });

    // 📌 DESIGN: the $ne on _id is the whole feature — without it, this becomes
    // "log out everywhere" and the caller loses their own session.
    it('should exclude the current session via $ne filter', async () => {
      Session.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await revokeOtherSessions({ userId, currentSessionId });

      const filter = Session.updateMany.mock.calls[0][0];
      expect(filter.user).toBe(userId);
      expect(filter._id).toEqual({ $ne: currentSessionId });
      expect(filter.isRevoked).toBe(false);
      expect(filter.expiresAt).toEqual({ $gt: expect.any(Date) });
    });

    // 📌 IDEMPOTENCE: a user with only their current session calling "revoke all
    // others" should succeed with count 0 — not error, not throw.
    it('should succeed with revokedCount: 0 when no other sessions exist', async () => {
      Session.updateMany.mockResolvedValue({ modifiedCount: 0 });

      const result = await revokeOtherSessions({ userId, currentSessionId });

      expect(result.revokedCount).toBe(0);
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
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('non-existent or unverified')
      );
    });

    it('should throw 429 if cooldown (20s) has not passed', async () => {
      User.findOne.mockResolvedValue({ isVerified: true });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 5000) });

      await expect(requestPasswordReset({ email })).rejects.toThrow(/Please wait \d+ seconds/);
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should generate OTP and queue send-reset-otp job if verified and cooldown passed', async () => {
      User.findOne.mockResolvedValue({ name: 'John', isVerified: true });
      Otp.findOne.mockResolvedValue({ createdAt: new Date(Date.now() - 25000) });
      Otp.deleteMany.mockResolvedValue({});
      Otp.create.mockResolvedValue({});
      emailQueue.add.mockResolvedValue({});

      await requestPasswordReset({ email });

      expect(Otp.deleteMany).toHaveBeenCalledWith({ email, purpose: 'reset' });
      expect(Otp.create).toHaveBeenCalledWith(expect.objectContaining({ email, purpose: 'reset' }));
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

    it('should query OTP with purpose "reset" (prevents signup/reset collision)', async () => {
      Otp.findOne.mockResolvedValue(null);

      await expect(resetPassword(payload)).rejects.toThrow('OTP has expired or does not exist');
      expect(Otp.findOne).toHaveBeenCalledWith({ email: 'john@example.com', purpose: 'reset' });
    });

    it('should throw 400 if OTP record exists but has expired', async () => {
      Otp.findOne.mockResolvedValue({
        _id: 'otp123',
        codeHash: 'hash',
        attempts: 0,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(resetPassword(payload)).rejects.toThrow('OTP has expired or does not exist');
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(Otp.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('should throw 429 if already locked out', async () => {
      Otp.findOne.mockResolvedValue({ attempts: 5, expiresAt: inMinutes(5) });
      await expect(resetPassword(payload)).rejects.toThrow(
        'Maximum verification attempts exceeded'
      );
    });

    it('should increment attempts and throw 400 on wrong OTP', async () => {
      const mockOtpRecord = { attempts: 1, expiresAt: inMinutes(5), save: jest.fn() };
      Otp.findOne.mockResolvedValue(mockOtpRecord);
      bcrypt.compare.mockResolvedValue(false);

      await expect(resetPassword(payload)).rejects.toThrow('You have 3 attempts remaining');
      expect(mockOtpRecord.attempts).toBe(2);
      expect(mockOtpRecord.save).toHaveBeenCalled();
    });

    it('should throw 400 if the OTP was already consumed by a concurrent request', async () => {
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
      expect(Session.updateMany).not.toHaveBeenCalled();
    });

    it('should update password, consume OTP, and revoke all sessions on success', async () => {
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
        expect.objectContaining({
          isRevoked: true,
          revokedAt: expect.any(Date),
        })
      );
    });
  });
});
