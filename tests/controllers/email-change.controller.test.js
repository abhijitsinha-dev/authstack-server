import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/services/signup.service.js', () => ({
  requestSignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  verifySignupOtp: jest.fn(),
  isUsernameAvailable: jest.fn(),
  isEmailAvailable: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/session.service.js', () => ({
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  refreshTokens: jest.fn(),
  getCurrentUser: jest.fn(),
  listUserSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeOtherSessions: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/password.service.js', () => ({
  changePassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/email-change.service.js', () => ({
  requestEmailChange: jest.fn(),
  verifyEmailChange: jest.fn(),
}));
const { requestEmailChange, verifyEmailChange } =
  await import('../../src/services/email-change.service.js');
const { requestEmailChangeController, verifyEmailChangeController } =
  await import('../../src/controllers/email-change.controller.js');
describe('email-change.controller', () => {
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

  describe('requestEmailChangeController', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
      req.body = { newEmail: 'new@example.com', currentPassword: 'OldPassword123!' };
    });

    it('should pass userId, newEmail, and currentPassword to the service', async () => {
      requestEmailChange.mockResolvedValue({});

      await requestEmailChangeController(req, res);

      expect(requestEmailChange).toHaveBeenCalledWith({
        userId: 'u1',
        newEmail: 'new@example.com',
        currentPassword: 'OldPassword123!',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Verification code sent to your new email.',
        data: { newEmail: 'new@example.com' },
      });
    });

    it('should propagate service errors (wrong password, same email, taken email)', async () => {
      requestEmailChange.mockRejectedValue(new Error('Current password is incorrect.'));

      await expect(requestEmailChangeController(req, res)).rejects.toThrow(
        'Current password is incorrect.'
      );
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmailChangeController', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
      req.body = { newEmail: 'new@example.com', otp: '123456' };
    });

    it('should pass all four params and return 200 with revokedCount + newEmail', async () => {
      verifyEmailChange.mockResolvedValue({ revokedCount: 2 });

      await verifyEmailChangeController(req, res);

      expect(verifyEmailChange).toHaveBeenCalledWith({
        userId: 'u1',
        currentSessionId: 's1',
        newEmail: 'new@example.com',
        otp: '123456',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Email changed. Other devices have been logged out.',
        data: { revokedCount: 2, newEmail: 'new@example.com' },
      });
    });

    it('should use the generic success message when revokedCount is 0', async () => {
      verifyEmailChange.mockResolvedValue({ revokedCount: 0 });

      await verifyEmailChangeController(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Email changed successfully.',
        data: { revokedCount: 0, newEmail: 'new@example.com' },
      });
    });

    it('should propagate service errors (wrong OTP, expired, etc.)', async () => {
      verifyEmailChange.mockRejectedValue(
        new Error('Invalid OTP code. You have 4 attempts remaining.')
      );

      await expect(verifyEmailChangeController(req, res)).rejects.toThrow('Invalid OTP code');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
