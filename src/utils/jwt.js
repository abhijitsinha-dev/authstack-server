import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Fast hash (SHA-256) for high-entropy secrets like Refresh Tokens.
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generates a short-lived Access Token.
 */
export const generateAccessToken = (userId, sessionId) => {
  return jwt.sign({ sub: userId, sid: sessionId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  });
};

/**
 * Generates a long-lived Refresh Token.
 */
export const generateRefreshToken = (userId, sessionId) => {
  return jwt.sign({ sub: userId, sid: sessionId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS || 30}d`,
  });
};
