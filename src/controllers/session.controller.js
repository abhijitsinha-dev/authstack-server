import {
  loginUser,
  logoutUser,
  refreshTokens,
  getCurrentUser,
  listUserSessions,
  revokeSession,
  revokeOtherSessions,
} from '../services/index.js';
import { sendAuthResponse } from '../utils/authResponse.js';

export const login = async (req, res) => {
  const { identifier, password } = req.body;
  const { user, accessToken, refreshToken } = await loginUser({
    identifier,
    password,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendAuthResponse(req, res, user, accessToken, refreshToken, 'Logged in successfully');
};

export const refreshTokenController = async (req, res) => {
  const fromCookie = !!req.cookies?.refreshToken;
  const token = req.cookies?.refreshToken || req.body?.refreshToken;

  const { accessToken, refreshToken } = await refreshTokens({ refreshToken: token });

  if (!fromCookie) {
    return res.status(200).json({
      success: true,
      data: { accessToken, refreshToken },
    });
  }

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    success: true,
    data: { accessToken },
  });
};

export const getMe = async (req, res) => {
  const user = await getCurrentUser({ userId: req.user.id });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  });
};

export const getSessions = async (req, res) => {
  const sessions = await listUserSessions({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { sessions } });
};

export const revokeSessionController = async (req, res) => {
  await revokeSession({
    sessionId: req.params.id,
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
  });
  res.status(200).json({ success: true, message: 'Session revoked successfully.' });
};

export const revokeOtherSessionsController = async (req, res) => {
  const { revokedCount } = await revokeOtherSessions({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
  });
  res.status(200).json({
    success: true,
    message: 'Other sessions revoked.',
    data: { revokedCount },
  });
};

export const logout = async (req, res) => {
  await logoutUser(req.user.sessionId);

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
};
