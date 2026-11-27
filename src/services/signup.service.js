import bcrypt from 'bcryptjs';
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
import { MAX_OTP_ATTEMPTS, OTP_TTL_MS } from './otp.constants.js';

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

  if (emailOwner?.isVerified) {
    throw new ApiError(409, 'An account with this email already exists. Please log in.');
  }

  if (usernameOwner?.isVerified) {
    throw new ApiError(
      409,
      'An account with this username already exists. Please choose another username.'
    );
  }

  const staleIds = [emailOwner?._id, usernameOwner?._id].filter(Boolean);
  if (staleIds.length) {
    await User.deleteMany({ _id: { $in: staleIds }, isVerified: false });
  }

  try {
    await User.create({ username, email, password });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'That username or email just got taken. Please try again.');
    }
    throw err;
  }

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
