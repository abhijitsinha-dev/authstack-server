import { jest } from '@jest/globals';
import { sendAuthResponse } from '../../src/utils/authResponse.js';

describe('authResponse utility', () => {
  let req;
  let res;
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      headers: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    };

    mockUser = {
      _id: 'u1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'user',
    };
  });

  it('should return JSON only and set HttpOnly cookie for Web clients', () => {
    req.headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/157.0.0.0';

    sendAuthResponse(req, res, mockUser, 'access-token', 'refresh-token', 'Success message');

    // Verify Cookie
    expect(res.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      })
    );

    // Verify JSON (should NOT have refreshToken)
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success message',
      data: {
        user: {
          id: 'u1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'user',
        },
        accessToken: 'access-token',
      },
    });
  });

  it('should return BOTH tokens in JSON and NOT set cookie for Mobile clients', () => {
    req.headers['user-agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)';

    sendAuthResponse(req, res, mockUser, 'access-token', 'refresh-token', 'Success message');

    // Verify Cookie was NOT called
    expect(res.cookie).not.toHaveBeenCalled();

    // Verify JSON (should HAVE refreshToken)
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success message',
      data: {
        user: {
          id: 'u1',
          name: 'John Doe',
          email: 'john@example.com',
          role: 'user',
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
  });

  it('should default to Web behavior if User-Agent is missing', () => {
    // req.headers['user-agent'] is undefined

    sendAuthResponse(req, res, mockUser, 'access-token', 'refresh-token', 'Success message');

    // Should set cookie (Web fallback)
    expect(res.cookie).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });
});
