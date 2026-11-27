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
const {
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  isUsernameAvailable,
  isEmailAvailable,
} = await import('../../src/services/signup.service.js');
const { requestOtp, checkUsernameAvailability, checkEmailAvailability, resendOtp, verifyOtp } =
  await import('../../src/controllers/signup.controller.js');
describe('signup.controller', () => {
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

  describe('checkUsernameAvailability', () => {
    it('returns the username availability result', async () => {
      req.validatedQuery = { username: 'john' };
      isUsernameAvailable.mockResolvedValue(true);

      await checkUsernameAvailability(req, res);

      expect(isUsernameAvailable).toHaveBeenCalledWith({ username: 'john' });
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { available: true } });
    });
  });

  describe('checkEmailAvailability', () => {
    it('returns the email availability result', async () => {
      req.validatedQuery = { email: 'john@example.com' };
      isEmailAvailable.mockResolvedValue(false);

      await checkEmailAvailability(req, res);

      expect(isEmailAvailable).toHaveBeenCalledWith({ email: 'john@example.com' });
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { available: false } });
    });
  });

  describe('requestOtp', () => {
    it('should call the service and return 200 with the correct payload', async () => {
      req.body = {
        username: 'john',
        email: 'john@example.com',
        password: 'Password123!',
      };
      requestSignupOtp.mockResolvedValue({});

      await requestOtp(req, res);

      expect(requestSignupOtp).toHaveBeenCalledWith({
        username: 'john',
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
    const mockUser = {
      _id: 'u1',
      username: 'john',
      name: 'John',
      email: 'test@example.com',
      role: 'user',
    };
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
          user: {
            id: 'u1',
            username: 'john',
            name: 'John',
            email: 'test@example.com',
            role: 'user',
          },
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
          user: {
            id: 'u1',
            username: 'john',
            name: 'John',
            email: 'test@example.com',
            role: 'user',
          },
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
});
