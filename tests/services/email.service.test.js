import { jest } from '@jest/globals';

// ─────────────────────────────────────────────
// 1. MOCK THE BREVO CLIENT
// ─────────────────────────────────────────────
const mockSendTransacEmail = jest.fn();

jest.unstable_mockModule('@getbrevo/brevo', () => ({
  BrevoClient: class {
    constructor() {
      this.transactionalEmails = { sendTransacEmail: mockSendTransacEmail };
    }
  },
}));

// ─────────────────────────────────────────────
// 2. MOCK THE LOGGER
// ─────────────────────────────────────────────
jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

// ─────────────────────────────────────────────
// 3. DYNAMIC IMPORTS
// ─────────────────────────────────────────────
const { sendSignupOtpEmail, sendPasswordResetEmail } =
  await import('../../src/services/email.service.js');
const { logger } = await import('../../src/config/logger.js');

// jest.setup.js sets these — tests rely on them
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL; // 'test@example.com'
const SENDER_NAME = process.env.BREVO_SENDER_NAME; // 'Test AuthStack'

describe('email.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendTransacEmail.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────
  // sendSignupOtpEmail
  // ─────────────────────────────────────────────
  describe('sendSignupOtpEmail', () => {
    const email = 'john@example.com';
    const name = 'John Doe';
    const otp = '123456';

    it('should call Brevo with the correct subject, sender, recipient, and OTP in the body', async () => {
      await sendSignupOtpEmail(email, name, otp);

      expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);

      const payload = mockSendTransacEmail.mock.calls[0][0];

      expect(payload.subject).toBe('Verify your Authstack account');
      expect(payload.sender).toEqual({ name: SENDER_NAME, email: SENDER_EMAIL });
      expect(payload.to).toEqual([{ email, name }]);
      expect(payload.htmlContent).toContain(otp);
      expect(payload.htmlContent).toContain(`Welcome to Authstack, ${name}!`);
    });

    // 🛡️ SECURITY: the XSS fix — user-controlled `name` must be escaped
    it('should HTML-escape the user-supplied name to prevent markup injection', async () => {
      const maliciousName = '<img src=x onerror=alert(1)>';

      await sendSignupOtpEmail(email, maliciousName, otp);

      const payload = mockSendTransacEmail.mock.calls[0][0];

      expect(payload.htmlContent).not.toContain('<img src=x');
      expect(payload.htmlContent).not.toContain('onerror=alert(1)>');
      expect(payload.htmlContent).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should escape all five HTML-significant characters', async () => {
      const trickyName = `Tom & Jerry's "<b>House</b>"`;

      await sendSignupOtpEmail(email, trickyName, otp);

      const html = mockSendTransacEmail.mock.calls[0][0].htmlContent;

      expect(html).toContain('Tom &amp; Jerry&#39;s &quot;&lt;b&gt;House&lt;/b&gt;&quot;');
      expect(html).not.toContain('<b>House</b>');
    });

    it('should log success with the recipient email', async () => {
      await sendSignupOtpEmail(email, name, otp);

      expect(logger.info).toHaveBeenCalledWith(`OTP email sent to ${email}`);
    });

    // 👇 Single call, uses toMatchObject — no double-invoke, no redundant mockRejectedValue
    it('should throw ApiError(500) with the correct message when Brevo fails', async () => {
      mockSendTransacEmail.mockRejectedValue(new Error('Brevo timeout'));

      await expect(sendSignupOtpEmail(email, name, otp)).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Failed to send verification email. Please try again later.',
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to send OTP email via Brevo', {
        error: 'Brevo timeout',
      });
    });
  });

  // ─────────────────────────────────────────────
  // sendPasswordResetEmail
  // ─────────────────────────────────────────────
  describe('sendPasswordResetEmail', () => {
    const email = 'john@example.com';
    const name = 'John Doe';
    const otp = '654321';

    it('should call Brevo with the reset-specific subject and body', async () => {
      await sendPasswordResetEmail(email, name, otp);

      expect(mockSendTransacEmail).toHaveBeenCalledTimes(1);

      const payload = mockSendTransacEmail.mock.calls[0][0];

      expect(payload.subject).toBe('Reset your Authstack password');
      expect(payload.sender).toEqual({ name: SENDER_NAME, email: SENDER_EMAIL });
      expect(payload.to).toEqual([{ email, name }]);
      expect(payload.htmlContent).toContain(otp);
      expect(payload.htmlContent).toContain('Password Reset Request');
      expect(payload.htmlContent).toContain('Your password will remain unchanged');
    });

    it('should HTML-escape the user-supplied name in the reset email body', async () => {
      const maliciousName = '<script>alert(1)</script>';

      await sendPasswordResetEmail(email, maliciousName, otp);

      const html = mockSendTransacEmail.mock.calls[0][0].htmlContent;

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('should log success with the recipient email', async () => {
      await sendPasswordResetEmail(email, name, otp);

      expect(logger.info).toHaveBeenCalledWith(`Password reset email sent to ${email}`);
    });

    it('should throw ApiError(500) with the reset-specific message when Brevo fails', async () => {
      mockSendTransacEmail.mockRejectedValue(new Error('503 Service Unavailable'));

      await expect(sendPasswordResetEmail(email, name, otp)).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Failed to send reset email. Please try again later.',
      });

      expect(logger.error).toHaveBeenCalledWith('Failed to send password reset email via Brevo', {
        error: '503 Service Unavailable',
      });
    });
  });
});
