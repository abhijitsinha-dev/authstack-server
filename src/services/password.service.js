import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import Session from '../models/session.model.js';
import { generateHashedOtp } from '../utils/otp.js';
import { emailQueue } from '../queues/email.queue.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { MAX_OTP_ATTEMPTS, OTP_TTL_MS } from './otp.constants.js';

export const changePassword = async ({
  userId,
  currentSessionId,
  currentPassword,
  newPassword,
}) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  if (currentPassword === newPassword) {
    throw new ApiError(400, 'New password must be different from current password.');
  }

  user.password = newPassword;
  await user.save();

  const result = await Session.updateMany(
    { user: userId, _id: { $ne: currentSessionId }, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() }
  );

  logger.info(
    `Password changed for ${user.email}. Revoked ${result.modifiedCount} other session(s).`
  );

  return { revokedCount: result.modifiedCount };
};

export const requestPasswordReset = async ({ email }) => {
  const user = await User.findOne({ email });

  if (!user || !user.isVerified) {
    logger.info(`Password reset requested for non-existent or unverified email: ${email}`);
    return;
  }

  const existingOtp = await Otp.findOne({ email, purpose: 'reset' });
  if (existingOtp && existingOtp.createdAt) {
    const timeSinceLastRequest = Date.now() - existingOtp.createdAt.getTime();
    const cooldownMs = 20 * 1000;
    if (timeSinceLastRequest < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timeSinceLastRequest) / 1000);
      throw new ApiError(429, `Please wait ${secondsLeft} seconds before requesting a new code.`);
    }
  }

  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await Otp.deleteMany({ email, purpose: 'reset' });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt, purpose: 'reset' });

  await emailQueue.add('send-reset-otp', {
    email,
    name: user.name || user.username,
    otp,
  });
};

export const resetPassword = async ({ email, otp, newPassword }) => {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(400, 'Invalid request.');

  const otpRecord = await Otp.findOne({ email, purpose: 'reset' });
  if (!otpRecord || otpRecord.expiresAt <= new Date()) {
    throw new ApiError(400, 'OTP has expired or does not exist. Please request a new one.');
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(429, 'Maximum verification attempts exceeded. Please request a new OTP.');
  }

  const isMatch = await bcrypt.compare(otp, otpRecord.codeHash);

  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();

    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      throw new ApiError(429, 'Maximum verification attempts exceeded. Please request a new OTP.');
    }
    throw new ApiError(
      400,
      `Invalid OTP code. You have ${MAX_OTP_ATTEMPTS - otpRecord.attempts} attempts remaining.`
    );
  }

  const consumed = await Otp.findOneAndDelete({ _id: otpRecord._id, purpose: 'reset' });
  if (!consumed) {
    throw new ApiError(400, 'OTP has already been used. Please request a new one.');
  }

  user.password = newPassword;
  await user.save();

  await Session.updateMany({ user: user._id }, { isRevoked: true, revokedAt: new Date() });

  logger.info(`Password successfully reset for ${email}. All sessions revoked.`);
};
