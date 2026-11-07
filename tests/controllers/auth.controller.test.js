import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/services/auth.service.js', () => ({
  requestSignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
}));

const { requestSignupOtp, resendSignupOtp } = await import('../../src/services/auth.service.js');
const { requestOtp, resendOtp } = await import('../../src/controllers/auth.controller.js');

describe('auth.controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('requestOtp', () => {
    it('should call the service and return 200 with the correct payload', async () => {
      req.body = { name: 'John', email: 'john@example.com', password: 'Password123' };
      requestSignupOtp.mockResolvedValue({});

      await requestOtp(req, res);

      expect(requestSignupOtp).toHaveBeenCalledWith({
        name: 'John',
        email: 'john@example.com',
        password: 'Password123',
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
});
