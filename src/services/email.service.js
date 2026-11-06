import { BrevoClient } from '@getbrevo/brevo';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
  maxRetries: 3,
  timeoutInSeconds: 10,
});

export const sendSignupOtpEmail = async (email, name, otp) => {
  try {
    await brevo.transactionalEmails.sendTransacEmail({
      subject: 'Verify your Authstack account',
      htmlContent: `
        <html>
          <body>
            <h2>Welcome to Authstack, ${name}!</h2>
            <p>Your verification code is:</p>
            <h1 style="letter-spacing: 5px; color: #4F46E5;">${otp}</h1>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          </body>
        </html>
      `,
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Authstack',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email, name }],
    });

    logger.info(`OTP email sent to ${email}`);
  } catch (error) {
    logger.error('Failed to send OTP email via Brevo', { error: error.message });
    throw new ApiError(500, 'Failed to send verification email. Please try again later.');
  }
};
