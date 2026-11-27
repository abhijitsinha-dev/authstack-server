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
const { changePassword, requestPasswordReset, resetPassword } =
  await import('../../src/services/password.service.js');
const { changePasswordController, forgotPassword, resetPasswordController } =
  await import('../../src/controllers/password.controller.js');
describe('password.controller', () => {
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

  describe('changePasswordController', () => {
    beforeEach(() => {
      req.user = { id: 'u1', sessionId: 's1', role: 'user' };
      req.body = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
        confirmPassword: 'NewPassword456!',
      };
    });

    it('should pass all four params to the service and return 200 with revokedCount', async () => {
      changePassword.mockResolvedValue({ revokedCount: 2 });

      await changePasswordController(req, res);

      expect(changePassword).toHaveBeenCalledWith({
        userId: 'u1',
        currentSessionId: 's1',
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword456!',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password changed. Other devices have been logged out.',
        data: { revokedCount: 2 },
      });
    });

    it('should use the generic success message when revokedCount is 0', async () => {
      changePassword.mockResolvedValue({ revokedCount: 0 });

      await changePasswordController(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password changed successfully.',
        data: { revokedCount: 0 },
      });
    });

    it('should propagate service errors', async () => {
      changePassword.mockRejectedValue(new Error('Current password is incorrect.'));

      await expect(changePasswordController(req, res)).rejects.toThrow(
        'Current password is incorrect.'
      );
      expect(res.status).not.toHaveBeenCalled();
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
    });
  });
});
