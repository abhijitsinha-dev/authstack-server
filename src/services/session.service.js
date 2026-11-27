import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Session from '../models/session.model.js';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { isStrongPassword } from '../utils/validator.js';

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
