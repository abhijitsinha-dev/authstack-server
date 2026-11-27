import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import Session from '../models/session.model.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/jwt.js';
import { generateHashedOtp } from '../utils/otp.js';
import { emailQueue } from '../queues/email.queue.js';
import { sendSignupOtpEmail, sendEmailChangeOtpEmail } from './email.service.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { isStrongPassword } from '../utils/validator.js';

// Maximum OTP attempts before lockout
const MAX_OTP_ATTEMPTS = 5;

// OTP validity window — must match the expiresAt set when creating the OTP
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const isUsernameAvailable = async ({ username }) => {
  return !(await User.exists({ username, isVerified: true }));
};

export const isEmailAvailable = async ({ email }) => {
  return !(await User.exists({ email, isVerified: true }));
};

export const requestSignupOtp = async ({ username, email, password }) => {
  const [emailOwner, usernameOwner] = await Promise.all([
    User.findOne({ email }),
    User.findOne({ username }),
  ]);

  // 1. Email belongs to a verified account → log in instead
  if (emailOwner?.isVerified) {
    throw new ApiError(409, 'An account with this email already exists. Please log in.');
  }

  // 2. A verified account owns the username → take another
  if (usernameOwner?.isVerified) {
    throw new ApiError(
      409,
      'An account with this username already exists. Please choose another username.'
    );
  }

  // 3. Replace any pending records that own the submitted email or username
  const staleIds = [emailOwner?._id, usernameOwner?._id].filter(Boolean);
  if (staleIds.length) {
    await User.deleteMany({ _id: { $in: staleIds }, isVerified: false });
  }

  // 4. Create pending user (catch race)
  try {
    await User.create({
      username,
      email,
      password,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'That username or email just got taken. Please try again.');
    }
    throw err;
  }

  // 5. OTP (upsert to avoid duplicates)
  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await Otp.deleteMany({ email, purpose: 'signup' });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt, purpose: 'signup' });

  await emailQueue.add('send-otp', { email, username, otp });
};

export const resendSignupOtp = async ({ email }) => {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, 'User not found. Please sign up first.');
  if (user.isVerified) throw new ApiError(400, 'Account is already verified. Please log in.');

  const existingOtp = await Otp.findOne({ email, purpose: 'signup' });
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

  await Otp.deleteMany({ email, purpose: 'signup' });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt, purpose: 'signup' });

  await sendSignupOtpEmail(email, user.name || user.username, otp);

  logger.info(`Resent OTP email sent synchronously to ${email}`);
};

export const verifySignupOtp = async ({ email, otp, ip, userAgent }) => {
  const user = await User.findOne({ email });

  if (!user) throw new ApiError(404, 'User not found. Please sign up first.');
  if (user.isVerified) throw new ApiError(400, 'User is already verified. Please log in.');

  const otpRecord = await Otp.findOne({ email, purpose: 'signup' });
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

  await Otp.deleteOne({ _id: otpRecord._id, purpose: 'signup' });

  user.isVerified = true;
  await user.save();

  const sessionId = new mongoose.Types.ObjectId();
  const accessToken = generateAccessToken(user._id, sessionId);
  const refreshToken = generateRefreshToken(user._id, sessionId);

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 864e5
  );

  await Session.create({
    _id: sessionId,
    user: user._id,
    refreshTokenHash,
    ip,
    userAgent,
    expiresAt,
  });

  return { user, accessToken, refreshToken };
};

export const loginUser = async ({ email, password, ip, userAgent }) => {
  if (!isStrongPassword(password)) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) throw new ApiError(401, 'Invalid email or password.');
  if (!user.isVerified) throw new ApiError(403, 'Please verify your email before logging in.');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new ApiError(401, 'Invalid email or password.');

  const sessionId = new mongoose.Types.ObjectId();
  const accessToken = generateAccessToken(user._id, sessionId);
  const refreshToken = generateRefreshToken(user._id, sessionId);

  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 864e5
  );

  await Session.create({
    _id: sessionId,
    user: user._id,
    refreshTokenHash,
    ip,
    userAgent,
    expiresAt,
  });

  user.password = undefined;

  return { user, accessToken, refreshToken };
};

export const getCurrentUser = async ({ userId }) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }
  return user;
};

export const logoutUser = async (sessionId) => {
  const session = await Session.findByIdAndUpdate(
    sessionId,
    { isRevoked: true, revokedAt: new Date() },
    { returnDocument: 'after' }
  );

  if (!session) {
    throw new ApiError(404, 'Session not found or already logged out.');
  }

  return session;
};

export const listUserSessions = async ({ userId, currentSessionId }) => {
  const sessions = await Session.find({
    user: userId,
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .select('-refreshTokenHash -__v')
    .lean();

  return sessions.map((s) => ({
    id: s._id.toString(),
    ip: s.ip,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    isCurrent: s._id.toString() === currentSessionId,
  }));
};

export const revokeSession = async ({ sessionId, userId, currentSessionId }) => {
  if (sessionId === currentSessionId) {
    throw new ApiError(400, 'Cannot revoke the current session. Use logout instead.');
  }

  const session = await Session.findOneAndUpdate(
    { _id: sessionId, user: userId, isRevoked: false, expiresAt: { $gt: new Date() } },
    { isRevoked: true, revokedAt: new Date() },
    { returnDocument: 'after' }
  );

  if (!session) {
    throw new ApiError(404, 'Session not found');
  }

  return session;
};

export const revokeOtherSessions = async ({ userId, currentSessionId }) => {
  const result = await Session.updateMany(
    {
      user: userId,
      _id: { $ne: currentSessionId },
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    },
    { isRevoked: true, revokedAt: new Date() }
  );

  return { revokedCount: result.modifiedCount };
};

export const refreshTokens = async ({ refreshToken }) => {
  if (!refreshToken) {
    throw new ApiError(401, 'No refresh token provided');
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const session = await Session.findById(payload.sid);
  if (!session || session.isRevoked) {
    throw new ApiError(401, 'Session has been revoked or expired');
  }

  const incomingHash = hashToken(refreshToken);
  if (incomingHash !== session.refreshTokenHash) {
    session.isRevoked = true;
    session.revokedAt = new Date();
    await session.save();
    logger.warn(`Refresh token reuse detected for session ${payload.sid}. Session revoked.`);
    throw new ApiError(401, 'Refresh token reuse detected. Please log in again.');
  }

  const accessToken = generateAccessToken(payload.sub, payload.sid);
  const newRefreshToken = generateRefreshToken(payload.sub, payload.sid);

  session.refreshTokenHash = hashToken(newRefreshToken);
  session.lastUsedAt = new Date();

  await session.save();

  return { accessToken, refreshToken: newRefreshToken };
};

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

  // Atomic consume BEFORE the update — a concurrent request that somehow also
  // passed bcrypt.compare loses the findOneAndDelete and gets a clean 400.
  const consumed = await Otp.findOneAndDelete({ _id: otpRecord._id, purpose: 'email-change' });
  if (!consumed) {
    throw new ApiError(400, 'OTP has already been used. Please request a new one.');
  }

  // Re-check availability right before the write — another user may have
  // registered this address during the OTP window.
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
