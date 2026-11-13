import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import Session from '../models/session.model.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/jwt.js';
import { generateHashedOtp } from '../utils/otp.js';
import { emailQueue } from '../queues/email.queue.js';
import { sendSignupOtpEmail } from './email.service.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { isStrongPassword } from '../utils/validator.js';

// Maximum OTP attempts before lockout
const MAX_OTP_ATTEMPTS = 5;

// OTP validity window — must match the expiresAt set when creating the OTP
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const requestSignupOtp = async ({ name, email, password }) => {
  // 1. Check if the user already exists and is verified
  const existingUser = await User.findOne({ email });

  if (existingUser && existingUser.isVerified) {
    throw new ApiError(409, 'An account with this email already exists. Please log in.');
  }

  // 2. If user exists but is NOT verified, delete them so we can start fresh
  if (existingUser && !existingUser.isVerified) {
    await User.deleteOne({ _id: existingUser._id });
  }

  // 3. Create the unverified user (password gets hashed by the model hook)
  await User.create({ name, email, password });

  // 4. Generate a secure OTP and hash it using bcrypt
  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // 5. Upsert the OTP in the database
  await Otp.deleteMany({ email, purpose: 'signup' });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt, purpose: 'signup' });

  // 6. Push the email task to the BullMQ queue (Asynchronous - fast API response)
  await emailQueue.add('send-otp', {
    email,
    name,
    otp,
  });
};

export const resendSignupOtp = async ({ email }) => {
  // 1. Check if user exists
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'User not found. Please sign up first.');
  }

  // 2. Check if user is already verified
  if (user.isVerified) {
    throw new ApiError(400, 'Account is already verified. Please log in.');
  }

  // 3. Rate Limiting (20-second cooldown)
  const existingOtp = await Otp.findOne({ email, purpose: 'signup' });
  if (existingOtp && existingOtp.createdAt) {
    const timeSinceLastRequest = Date.now() - existingOtp.createdAt.getTime();
    const cooldownMs = 20 * 1000;

    if (timeSinceLastRequest < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timeSinceLastRequest) / 1000);
      throw new ApiError(429, `Please wait ${secondsLeft} seconds before requesting a new code.`);
    }
  }

  // 4. Generate a new OTP and hash it
  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // 5. Replace the old OTP in the database
  await Otp.deleteMany({ email, purpose: 'signup' });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt, purpose: 'signup' });

  // 6. Send the email SYNCHRONOUSLY (Await it)
  // If Brevo fails, this throws an ApiError (500) and the user knows immediately.
  await sendSignupOtpEmail(email, user.name, otp);

  logger.info(`Resent OTP email sent synchronously to ${email}`);
};

export const verifySignupOtp = async ({ email, otp, ip, userAgent }) => {
  // 1. Find and validate the user FIRST (fail fast)
  const user = await User.findOne({ email });

  if (!user) throw new ApiError(404, 'User not found. Please sign up first.');
  if (user.isVerified) throw new ApiError(400, 'User is already verified. Please log in.');

  // 2. Fetch the OTP only if the user is valid and unverified.
  //    Enforce expiry in code — the MongoDB TTL index can lag up to ~60s,
  //    so a "10-minute" OTP might otherwise be usable for ~11 minutes.
  const otpRecord = await Otp.findOne({ email, purpose: 'signup' });
  if (!otpRecord || otpRecord.expiresAt <= new Date()) {
    throw new ApiError(400, 'OTP has expired or does not exist. Please request a new one.');
  }

  // 3. Check if they are locked out
  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(429, 'Maximum verification attempts exceeded. Please request a new OTP.');
  }

  // 4. Verify the OTP
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

  // 5. OTP is valid! Delete it
  await Otp.deleteOne({ _id: otpRecord._id, purpose: 'signup' });

  // 6. Mark user as verified
  user.isVerified = true;
  await user.save();

  // 7. Generate tokens and create session
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
  // 1. Fast-fail: If the password is weak, we KNOW it's wrong (all stored
  //    passwords are strong because signup enforces it). Skipping the DB query
  //    saves a round-trip on bad logins and avoids a timing oracle.
  if (!isStrongPassword(password)) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  // 2. Find user and explicitly select the password field
  const user = await User.findOne({ email }).select('+password');

  // 3. Check if user exists (Use generic "Invalid credentials" to prevent user enumeration)
  if (!user) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  // 4. Check if user is verified
  if (!user.isVerified) {
    throw new ApiError(403, 'Please verify your email before logging in.');
  }

  // 5. Compare passwords
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  // 6. Generate Session ID and Tokens
  const sessionId = new mongoose.Types.ObjectId();
  const accessToken = generateAccessToken(user._id, sessionId);
  const refreshToken = generateRefreshToken(user._id, sessionId);

  // 7. Hash the refresh token and save the Session
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

  // Remove password from the returned user object for safety
  user.password = undefined;

  return { user, accessToken, refreshToken };
};

/**
 * Fetch the authenticated user's profile.
 *
 * `req.user.id` comes from the `protect` middleware, which already verified
 * the access token and confirmed the session is active. This second DB read
 * exists because we need `name` / `email` — the JWT only carries `sub` (id)
 * and `sid` (session), to keep tokens small.
 */
export const getCurrentUser = async ({ userId }) => {
  const user = await User.findById(userId);
  if (!user) {
    // Edge case: session references a user that's been deleted.
    // Treat as a revoked session — don't reveal "user was deleted".
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }
  return user;
};

export const logoutUser = async (sessionId) => {
  // Mark the session as revoked in the database
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

/**
 * Rotate the refresh token and issue a new access token.
 *
 * The refresh token is single-use: each call invalidates the previous one
 * and issues a fresh pair. If an old (already-rotated) token is presented,
 * we treat it as a replay — the token either leaked or the client is buggy —
 * and revoke the entire session.
 */
export const refreshTokens = async ({ refreshToken }) => {
  if (!refreshToken) {
    throw new ApiError(401, 'No refresh token provided');
  }

  // 1. Verify JWT signature and expiry
  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  // 2. Look up the session
  const session = await Session.findById(payload.sid);
  if (!session || session.isRevoked) {
    throw new ApiError(401, 'Session has been revoked or expired');
  }

  // 3. 🚨 REUSE DETECTION: hash the incoming token and compare with the stored hash.
  //    If they don't match, an OLD token is being replayed — either the token
  //    leaked, or a client cached the previous one. Either way, revoke the
  //    entire session so the attacker and the legitimate client both get
  //    logged out (the legitimate user will just log in again).
  const incomingHash = hashToken(refreshToken);
  if (incomingHash !== session.refreshTokenHash) {
    session.isRevoked = true;
    session.revokedAt = new Date();
    await session.save();
    logger.warn(`Refresh token reuse detected for session ${payload.sid}. Session revoked.`);
    throw new ApiError(401, 'Refresh token reuse detected. Please log in again.');
  }

  // 4. Rotate: issue new access + new refresh, store the new hash
  const accessToken = generateAccessToken(payload.sub, payload.sid);
  const newRefreshToken = generateRefreshToken(payload.sub, payload.sid);

  session.refreshTokenHash = hashToken(newRefreshToken);
  // Deliberately NOT updating ip / userAgent — those describe where the
  // session was first established (login), not where it was last refreshed.
  await session.save();

  return { accessToken, refreshToken: newRefreshToken };
};

export const requestPasswordReset = async ({ email }) => {
  const user = await User.findOne({ email });

  // 🔒 SECURITY: Return silently for both non-existent and unverified users.
  // This prevents email enumeration. The controller always returns the same
  // generic 200 OK response, so an attacker cannot distinguish between:
  //   - email doesn't exist
  //   - email exists but isn't verified
  //   - email exists and is verified
  if (!user || !user.isVerified) {
    logger.info(`Password reset requested for non-existent or unverified email: ${email}`);
    return;
  }

  // Cooldown check (20 seconds)
  const existingOtp = await Otp.findOne({ email, purpose: 'reset' });
  if (existingOtp && existingOtp.createdAt) {
    const timeSinceLastRequest = Date.now() - existingOtp.createdAt.getTime();
    const cooldownMs = 20 * 1000;
    if (timeSinceLastRequest < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timeSinceLastRequest) / 1000);
      throw new ApiError(429, `Please wait ${secondsLeft} seconds before requesting a new code.`);
    }
  }

  // Generate secure OTP
  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Upsert the OTP (purpose: reset)
  await Otp.deleteMany({ email, purpose: 'reset' });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt, purpose: 'reset' });

  // Send via queue (asynchronous)
  await emailQueue.add('send-reset-otp', {
    email,
    name: user.name,
    otp,
  });
};

export const resetPassword = async ({ email, otp, newPassword }) => {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(400, 'Invalid request.');

  // Fetch the OTP and enforce expiry in code (TTL index can lag up to ~60s)
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

  // 🚨 ATOMIC CONSUME: delete the OTP atomically BEFORE mutating the password.
  // Without this, two concurrent requests could both pass bcrypt.compare and
  // race to overwrite the password — last-write-wins. That would let an attacker
  // who intercepted the OTP hijack the reset by submitting their own password
  // after the user's request started. Only one caller can delete the document;
  // the loser gets null and must request a new OTP.
  const consumed = await Otp.findOneAndDelete({ _id: otpRecord._id, purpose: 'reset' });
  if (!consumed) {
    throw new ApiError(400, 'OTP has already been used. Please request a new one.');
  }

  // Update Password (the model hook will hash it)
  user.password = newPassword;
  await user.save();

  // 🚨 SECURITY: Revoke all active sessions (log out all devices)
  await Session.updateMany({ user: user._id }, { isRevoked: true, revokedAt: new Date() });

  logger.info(`Password successfully reset for ${email}. All sessions revoked.`);
};
