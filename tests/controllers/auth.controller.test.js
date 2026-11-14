import { jest } from '@jest/globals';

// 1. Mock the service layer
jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  requestSignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  verifySignupOtp: jest.fn(),
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  refreshTokens: jest.fn(),
  getCurrentUser: jest.fn(),
  listUserSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeOtherSessions: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
}));

// 2. Dynamic imports
const {
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  loginUser,
  logoutUser,
  refreshTokens,
  getCurrentUser,
  listUserSessions,
  revokeSession,
  revokeOtherSessions,
  requestPasswordReset,
  resetPassword,
} = await import('../../src/services/auth.service.js');

const {
  requestOtp,
  resendOtp,
  verifyOtp,
  login,
  refreshTokenController,
  getMe,
  getSessions,
  revokeSessionController,
  revokeOtherSessionsController,
  logout,
  forgotPassword,
  resetPasswordController,
} = await import('../../src/controllers/auth.controller.js');

describe('auth.controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      headers: {},
      cookies: {},
      params: {},
      ip: '127.0.0.1',
      user: { sessionId: 'fake-session-id' },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      setHeader: jest.fn(),
    };
  });

  describe('requestOtp', () => {
    it('should call the service and return 200 with the correct payload', async () => {
      req.body = { name: 'John', email: 'john@example.com', password: 'Password123!' };
      requestSignupOtp.mockResolvedValue({});

      await requestOtp(req, res);

      expect(requestSignupOtp).toHaveBeenCalledWith({
        name: 'John',
        email: 'john@example.com',
        password: 'Password123!',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Verification code sent to your email',
        data: { email: 'john@example.com' },
      });
    });

    it('should throw an error if the service throws', async () => {
      req.body = { email: 'fail@example.com' };
      requestSignupOtp.mockRejectedValue(new Error('Service failed'));

      await expect(requestOtp(req, res)).rejects.toThrow('Service failed');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('resendOtp', () => {
    it('should call the service and return 200 with the correct payload', async () => {
      req.body = { email: 'john@example.com' };
      resendSignupOtp.mockResolvedValue({});

      await resendOtp(req, res);

      expect(resendSignupOtp).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Verification code sent to your email',
        data: { email: 'john@example.com' },
      });
    });

    it('should throw an error if the service throws', async () => {
      req.body = { email: 'fail@example.com' };
      resendSignupOtp.mockRejectedValue(new Error('Cooldown active'));

      await expect(resendOtp(req, res)).rejects.toThrow('Cooldown active');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    const mockUser = { _id: 'u1', name: 'John', email: 'test@example.com', role: 'user' };
    const mockTokens = { accessToken: 'fake-access', refreshToken: 'fake-refresh' };

    beforeEach(() => {
      req.body = { email: 'test@example.com', otp: '123456' };
      verifySignupOtp.mockResolvedValue({ user: mockUser, ...mockTokens });
    });

    it('should set HttpOnly cookie and NOT return refreshToken in JSON for Web', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      await verifyOtp(req, res);

      expect(verifySignupOtp).toHaveBeenCalledWith({
        email: 'test@example.com',
        otp: '123456',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'fake-refresh',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Account verified successfully',
        data: {
          user: { id: 'u1', name: 'John', email: 'test@example.com', role: 'user' },
          accessToken: 'fake-access',
        },
      });

      const jsonResponse = res.json.mock.calls[0][0];
      expect(jsonResponse.data.refreshToken).toBeUndefined();
    });

    it('should return BOTH tokens in JSON and NOT set a cookie for Mobile', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';

      await verifyOtp(req, res);

      expect(res.cookie).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Account verified successfully',
        data: {
          user: { id: 'u1', name: 'John', email: 'test@example.com', role: 'user' },
          accessToken: 'fake-access',
          refreshToken: 'fake-refresh',
        },
      });
    });

    it('should throw an error if the service fails', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0';
      verifySignupOtp.mockRejectedValue(new Error('Invalid OTP'));

      await expect(verifyOtp(req, res)).rejects.toThrow('Invalid OTP');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const mockUser = { _id: 'u1', name: 'John', email: 'test@example.com', role: 'user' };
    const mockTokens = { accessToken: 'fake-access', refreshToken: 'fake-refresh' };

    beforeEach(() => {
      req.body = { email: 'test@example.com', password: 'Password123!' };
      loginUser.mockResolvedValue({ user: mockUser, ...mockTokens });
    });

    it('should set HttpOnly cookie and NOT return refreshToken in JSON for Web', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      await login(req, res);

      expect(loginUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123!',
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'fake-refresh',
        expect.objectContaining({ httpOnly: true })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged in successfully',
        data: {
          user: { id: 'u1', name: 'John', email: 'test@example.com', role: 'user' },
          accessToken: 'fake-access',
        },
      });

      const jsonResponse = res.json.mock.calls[0][0];
      expect(jsonResponse.data.refreshToken).toBeUndefined();
    });

    it('should return BOTH tokens in JSON and NOT set a cookie for Mobile', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';

      await login(req, res);

      expect(res.cookie).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged in successfully',
        data: {
          user: { id: 'u1', name: 'John', email: 'test@example.com', role: 'user' },
          accessToken: 'fake-access',
          refreshToken: 'fake-refresh',
        },
      });
    });

    it('should throw an error if the service fails', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0';
      loginUser.mockRejectedValue(new Error('Invalid email or password.'));

      await expect(login(req, res)).rejects.toThrow('Invalid email or password.');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // refreshTokenController
  // ─────────────────────────────────────────────
  describe('refreshTokenController', () => {
    beforeEach(() => {
      refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
    });

    it('should read from cookie and set a rotated cookie (web)', async () => {
      req.cookies = { refreshToken: 'cookie-token' };

      await refreshTokenController(req, res);

      expect(refreshTokens).toHaveBeenCalledWith({ refreshToken: 'cookie-token' });

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh',
        expect.objectContaining({ httpOnly: true, sameSite: 'strict' })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.success).toBe(true);
      expect(json.data.accessToken).toBe('new-access');
      // Web: refresh token is in the cookie, not the body
      expect(json.data.refreshToken).toBeUndefined();
    });

    it('should read from body and return BOTH tokens (mobile)', async () => {
      req.cookies = {};
      req.body = { refreshToken: 'body-token' };

      await refreshTokenController(req, res);

      expect(refreshTokens).toHaveBeenCalledWith({ refreshToken: 'body-token' });
      expect(res.cookie).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.data.accessToken).toBe('new-access');
      // Mobile: both tokens in the body
      expect(json.data.refreshToken).toBe('new-refresh');
    });

    it('should prefer cookie over body when both are present', async () => {
      req.cookies = { refreshToken: 'cookie-token' };
      req.body = { refreshToken: 'body-token' };

      await refreshTokenController(req, res);

      // `req.cookies?.refreshToken || req.body?.refreshToken` — cookie wins
      expect(refreshTokens).toHaveBeenCalledWith({ refreshToken: 'cookie-token' });
    });

    it('should propagate service errors (e.g., reuse detection)', async () => {
      req.cookies = { refreshToken: 'old-token' };
      refreshTokens.mockRejectedValue(new Error('Refresh token reuse detected'));

      await expect(refreshTokenController(req, res)).rejects.toThrow('reuse detected');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // getMe
  // ─────────────────────────────────────────────
  describe('getMe', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
    });

    it('should return the current user with Cache-Control header', async () => {
      getCurrentUser.mockResolvedValue({
        _id: 'u1',
        name: 'John',
        email: 'j@example.com',
        role: 'user',
      });

      await getMe(req, res);

      expect(getCurrentUser).toHaveBeenCalledWith({ userId: 'u1' });
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: 'u1',
            name: 'John',
            email: 'j@example.com',
            role: 'user',
          },
        },
      });
    });

    it('should propagate service errors (stale session → user deleted)', async () => {
      getCurrentUser.mockRejectedValue(
        new Error('Session is no longer valid. Please log in again.')
      );

      await expect(getMe(req, res)).rejects.toThrow('Session is no longer valid');
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // getSessions
  // ─────────────────────────────────────────────
  describe('getSessions', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
    });

    it('should pass userId and currentSessionId to the service and return 200', async () => {
      const mockSessions = [
        {
          id: 's1',
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          createdAt: '2026-11-14T10:00:00Z',
          lastUsedAt: '2026-11-14T12:00:00Z',
          isCurrent: true,
        },
        {
          id: 's2',
          ip: '203.0.113.1',
          userAgent: 'Mozilla/5.0 (iPhone)',
          createdAt: '2026-11-13T10:00:00Z',
          lastUsedAt: '2026-11-13T10:00:00Z',
          isCurrent: false,
        },
      ];
      listUserSessions.mockResolvedValue(mockSessions);

      await getSessions(req, res);

      expect(listUserSessions).toHaveBeenCalledWith({
        userId: 'u1',
        currentSessionId: 's1',
      });

      // Cache-Control prevents per-user data from being cached by proxies
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { sessions: mockSessions },
      });
    });

    it('should propagate service errors', async () => {
      listUserSessions.mockRejectedValue(new Error('DB unavailable'));

      await expect(getSessions(req, res)).rejects.toThrow('DB unavailable');
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // revokeSessionController
  // ─────────────────────────────────────────────
  describe('revokeSessionController', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
      req.params = { id: 's2' };
    });

    it('should pass all three scoping params to the service and return 200', async () => {
      revokeSession.mockResolvedValue({});

      await revokeSessionController(req, res);

      expect(revokeSession).toHaveBeenCalledWith({
        sessionId: 's2',
        userId: 'u1',
        currentSessionId: 's1',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Session revoked successfully.',
      });
    });

    it('should propagate service errors (404, 400 for current, etc.)', async () => {
      revokeSession.mockRejectedValue(new Error('Session not found'));

      await expect(revokeSessionController(req, res)).rejects.toThrow('Session not found');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // revokeOtherSessionsController
  // ─────────────────────────────────────────────
  describe('revokeOtherSessionsController', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
    });

    it('should pass userId and currentSessionId, return 200 with revokedCount', async () => {
      revokeOtherSessions.mockResolvedValue({ revokedCount: 3 });

      await revokeOtherSessionsController(req, res);

      expect(revokeOtherSessions).toHaveBeenCalledWith({
        userId: 'u1',
        currentSessionId: 's1',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Other sessions revoked.',
        data: { revokedCount: 3 },
      });
    });

    it('should handle zero revoked sessions (idempotent)', async () => {
      // No other sessions — the operation still succeeds
      revokeOtherSessions.mockResolvedValue({ revokedCount: 0 });

      await revokeOtherSessionsController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Other sessions revoked.',
        data: { revokedCount: 0 },
      });
    });

    it('should propagate service errors', async () => {
      revokeOtherSessions.mockRejectedValue(new Error('DB unavailable'));

      await expect(revokeOtherSessionsController(req, res)).rejects.toThrow('DB unavailable');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should revoke the session, clear the cookie, and return 200', async () => {
      logoutUser.mockResolvedValue({});

      await logout(req, res);

      expect(logoutUser).toHaveBeenCalledWith('fake-session-id');

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully.',
      });
    });

    it('should throw an error if the service fails', async () => {
      logoutUser.mockRejectedValue(new Error('Session not found'));

      await expect(logout(req, res)).rejects.toThrow('Session not found');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.clearCookie).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should call service and return the generic anti-enumeration message', async () => {
      req.body = { email: 'john@example.com' };
      requestPasswordReset.mockResolvedValue(undefined);

      await forgotPassword(req, res);

      expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists with that email, a password reset code has been sent.',
      });
    });

    it('should propagate service errors', async () => {
      req.body = { email: 'fail@example.com' };
      requestPasswordReset.mockRejectedValue(new Error('Cooldown active'));

      await expect(forgotPassword(req, res)).rejects.toThrow('Cooldown active');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('resetPasswordController', () => {
    it('should call service and return 200 with success message (no tokens)', async () => {
      req.body = {
        email: 'john@example.com',
        otp: '123456',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      };
      resetPassword.mockResolvedValue(undefined);

      await resetPasswordController(req, res);

      expect(resetPassword).toHaveBeenCalledWith({
        email: 'john@example.com',
        otp: '123456',
        newPassword: 'NewPassword123!',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
      });
    });

    it('should propagate service errors', async () => {
      req.body = { email: 'fail@example.com', otp: '000000', newPassword: 'NewPassword123!' };
      resetPassword.mockRejectedValue(new Error('Invalid OTP code.'));

      await expect(resetPasswordController(req, res)).rejects.toThrow('Invalid OTP code.');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
