import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Fast hash (SHA-256) for high-entropy secrets like Refresh Tokens.
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generates a secure 6-digit OTP and hashes it with bcrypt.
 * Returns the plain OTP (for the email) and the bcrypt hash (for the DB).
 */
export const generateHashedOtp = async () => {
  // 1. Generate a cryptographically secure 6-digit number
  const otp = crypto.randomInt(100000, 1000000).toString();

  // 2. Hash it with bcrypt (12 salt rounds)
  const hashedOtp = await bcrypt.hash(otp, 12);

  return { otp, hashedOtp };
};
