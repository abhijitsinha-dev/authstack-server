import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import Session from '../models/session.model.js';
import { generateHashedOtp } from '../utils/otp.js';
import { sendEmailChangeOtpEmail } from './email.service.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { MAX_OTP_ATTEMPTS, OTP_TTL_MS } from './otp.constants.js';

/**
 * Step 1 of email change: verify the current password, then send a 6-digit
 * OTP to the NEW email address. Synchronous delivery (same as resend-otp) —
 * the user is actively waiting for this code on an address they may not
 * yet have confirmed.
 *
 * Requires `currentPassword` — not just a valid session — to close the
 * window where a stolen access token could redirect the account recovery
 * channel to an attacker-controlled address.
 */
export const requestEmailChange = async ({ userId, newEmail, currentPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Current password is incorrect.');
  }

  if (user.email === newEmail) {
    throw new ApiError(400, 'New email must be different from current email.');
  }

  // Fail fast if the target address is already claimed by another account.
  // The unique index on User.email is the final safety net — this gives the
  // user a clear message before they go fetch an OTP from an inbox they may
  // not even own.
  const existingUser = await User.findOne({ email: newEmail });
  if (existingUser) {
    throw new ApiError(409, 'This email is already in use.');
  }

  // Cooldown — per user, not per target address. Prevents a user from
  // spamming different addresses within the cooldown window.
  const existingOtp = await Otp.findOne({ userId, purpose: 'email-change' });
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

  // Delete any previous email-change OTP for this user (a stale OTP for a
  // different newEmail must not linger and be usable later).
  await Otp.deleteMany({ userId, purpose: 'email-change' });
  await Otp.create({
    userId,
    email: newEmail,
    codeHash: hashedOtp,
    expiresAt,
    purpose: 'email-change',
  });

  await sendEmailChangeOtpEmail(newEmail, user.name || user.username, otp);

  logger.info(`Email change OTP sent synchronously to ${newEmail} for user ${userId}`);
};

/**
 * Step 2 of email change: verify the OTP and commit the change.
 *
 * The OTP proves possession of the new email — that's the second factor
 * on top of the session + password checked in step 1. On success, all
 * OTHER sessions are revoked (keeps the current one, same as change-password)
 * so a compromised device that triggered the change is logged out while
 * the legitimate user stays active on the device they're using.
 */
export const verifyEmailChange = async ({ userId, currentSessionId, newEmail, otp }) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }

  // Defense in depth — same-email check should already have fired at request time
  if (user.email === newEmail) {
    throw new ApiError(400, 'New email must be different from current email.');
  }

  const otpRecord = await Otp.findOne({ userId, email: newEmail, purpose: 'email-change' });
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

  const consumed = await Otp.findOneAndDelete({ _id: otpRecord._id, purpose: 'email-change' });
  if (!consumed) {
    throw new ApiError(400, 'OTP has already been used. Please request a new one.');
  }

  const existingUser = await User.findOne({ email: newEmail });
  if (existingUser && existingUser._id.toString() !== userId) {
    throw new ApiError(409, 'This email is already in use.');
  }

  user.email = newEmail;
  await user.save();

  const result = await Session.updateMany(
    { user: userId, _id: { $ne: currentSessionId }, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() }
  );

  logger.info(
    `Email changed for user ${userId} to ${newEmail}. Revoked ${result.modifiedCount} other session(s).`
  );

  return { revokedCount: result.modifiedCount };
};
