import { jest } from '@jest/globals';

// 1. Mock the service layer (including the new logoutUser)
jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  requestSignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  verifySignupOtp: jest.fn(),
  loginUser: jest.fn(),
  logoutUser: jest.fn(), // 👈 Added logoutUser to the mock
}));

// 2. Dynamic imports
const { requestSignupOtp, resendSignupOtp, verifySignupOtp, loginUser, logoutUser } =
  await import('../../src/services/auth.service.js');
const { requestOtp, resendOtp, verifyOtp, login, logout } =
  await import('../../src/controllers/auth.controller.js');

describe('auth.controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Express Request
    req = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      user: { sessionId: 'fake-session-id' }, // 👈 Added for logout
    };

    // Mock Express Response
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(), // 👈 Added for logout
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
        message: 'Verification code sent to your email.',
        data: { email: 'john@example.com' },
      });
    });

    it('should throw an error if the service throws (Express 5 handles this automatically)', async () => {
      req.body = { email: 'fail@example.com' };
      requestSignupOtp.mockRejectedValue(new Error('Service failed'));

      await expect(requestOtp(req, res)).rejects.toThrow('Service failed');
      expect(res.status).not.toHaveBeenCalled();
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
        message: 'A new verification code has been sent to your email.',
        data: { email: 'john@example.com' },
      });
    });

    it('should throw an error if the service throws', async () => {
      req.body = { email: 'fail@example.com' };
      resendSignupOtp.mockRejectedValue(new Error('Cooldown active'));

      await expect(resendOtp(req, res)).rejects.toThrow('Cooldown active');
      expect(res.status).not.toHaveBeenCalled();
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
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Account verified successfully.',
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
        message: 'Account verified successfully.',
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
        message: 'Logged in successfully.',
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
        message: 'Logged in successfully.',
        data: {
          user: { id: 'u1', name: 'John', email: 'test@example.com', role: 'user' },
          accessToken: 'fake-access',
          refreshToken: 'fake-refresh',
        },
      });
    });

    it('should throw an error if the service fails (e.g., invalid credentials)', async () => {
      req.headers['user-agent'] = 'Mozilla/5.0';
      loginUser.mockRejectedValue(new Error('Invalid email or password.'));

      await expect(login(req, res)).rejects.toThrow('Invalid email or password.');
      expect(res.status).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // 👇 NEW TESTS FOR LOGOUT
  describe('logout', () => {
    it('should revoke the session, clear the cookie, and return 200', async () => {
      logoutUser.mockResolvedValue({});

      await logout(req, res);

      // Verify service call
      expect(logoutUser).toHaveBeenCalledWith('fake-session-id');

      // Verify cookie is cleared
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true })
      );

      // Verify JSON response
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
    });
  });
});
