import { BrevoClient } from '@getbrevo/brevo';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
  maxRetries: 3,
  timeoutInSeconds: 10,
});

// Escape user-controlled strings before HTML interpolation.
const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sender = {
  name: process.env.BREVO_SENDER_NAME || 'AuthStack',
  email: process.env.BREVO_SENDER_EMAIL,
};

export const sendSignupOtpEmail = async (email, name, otp) => {
  try {
    await brevo.transactionalEmails.sendTransacEmail({
      subject: 'Verify your Authstack account',
      htmlContent: `
        <html>
          <body>
            <h2>Welcome to Authstack, ${escapeHtml(name)}!</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing: 5px; color: #4F46E5;">${otp}</h1>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          </body>
        </html>
      `,
      sender,
      to: [{ email, name }],
    });

    logger.info(`OTP email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send OTP email via Brevo', { error: error.message });
    throw new ApiError(500, 'Failed to send verification email. Please try again later.');
  }
};

export const sendPasswordResetEmail = async (email, name, otp) => {
  try {
    await brevo.transactionalEmails.sendTransacEmail({
      subject: 'Reset your Authstack password',
      htmlContent: `
        <html>
          <body>
            <h2>Password Reset Request</h2>
            <p>Hi ${escapeHtml(name)},</p>
            <p>We received a request to reset your password. Your verification code is:</p>
            <h1 style="letter-spacing: 5px; color: #4F46E5;">${otp}</h1>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
          </body>
        </html>
      `,
      sender,
      to: [{ email, name }],
    });
    logger.info(`Password reset email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send password reset email via Brevo', { error: error.message });
    throw new ApiError(500, 'Failed to send reset email. Please try again later.');
  }
};

export const sendEmailChangeOtpEmail = async (email, name, otp) => {
  try {
    await brevo.transactionalEmails.sendTransacEmail({
      subject: 'Confirm your new email on Authstack',
      htmlContent: `
        <html>
          <body>
            <h2>Confirm Your New Email</h2>
            <p>Hi ${escapeHtml(name)},</p>
            <p>We received a request to change your Authstack account email to this address. Your verification code is:</p>
            <h1 style="letter-spacing: 5px; color: #4F46E5;">${otp}</h1>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this, you can safely ignore this email. Your email address will remain unchanged.</p>
          </body>
        </html>
      `,
      sender,
      to: [{ email, name }],
    });
    logger.info(`Email change OTP sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send email change OTP via Brevo', { error: error.message });
    throw new ApiError(500, 'Failed to send verification email. Please try again later.');
  }
};
