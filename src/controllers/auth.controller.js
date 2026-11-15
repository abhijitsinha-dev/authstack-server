import {
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  loginUser,
  logoutUser,
  refreshTokens,
  getCurrentUser,
  listUserSessions,
  revokeSession,
  revokeOtherSessions,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
  requestPasswordReset,
  resetPassword,
} from '../services/auth.service.js';
import { sendAuthResponse } from '../utils/authResponse.js';

export const requestOtp = async (req, res) => {
  const { name, email, password } = req.body;
  await requestSignupOtp({ name, email, password });
  res.status(200).json({
    success: true,
    message: 'Verification code sent to your email',
    data: { email },
  });
};

export const resendOtp = async (req, res) => {
  const { email } = req.body;
  await resendSignupOtp({ email });
  res.status(200).json({
    success: true,
    message: 'Verification code sent to your email',
    data: { email },
  });
};

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  const { user, accessToken, refreshToken } = await verifySignupOtp({
    email,
    otp,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendAuthResponse(req, res, user, accessToken, refreshToken, 'Account verified successfully');
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await loginUser({
    email,
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
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
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

export const changePasswordController = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { revokedCount } = await changePassword({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
    currentPassword,
    newPassword,
  });
  res.status(200).json({
    success: true,
    message:
      revokedCount > 0
        ? 'Password changed. Other devices have been logged out.'
        : 'Password changed successfully.',
    data: { revokedCount },
  });
};

export const requestEmailChangeController = async (req, res) => {
  const { newEmail, currentPassword } = req.body;
  await requestEmailChange({ userId: req.user.id, newEmail, currentPassword });
  res.status(200).json({
    success: true,
    message: 'Verification code sent to your new email.',
    data: { newEmail },
  });
};

export const verifyEmailChangeController = async (req, res) => {
  const { newEmail, otp } = req.body;
  const { revokedCount } = await verifyEmailChange({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
    newEmail,
    otp,
  });
  res.status(200).json({
    success: true,
    message:
      revokedCount > 0
        ? 'Email changed. Other devices have been logged out.'
        : 'Email changed successfully.',
    data: { revokedCount, newEmail },
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

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  await requestPasswordReset({ email });
  res.status(200).json({
    success: true,
    message: 'If an account exists with that email, a password reset code has been sent.',
  });
};

export const resetPasswordController = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  await resetPassword({ email, otp, newPassword });
  res.status(200).json({
    success: true,
    message: 'Password reset successfully. Please log in with your new password.',
  });
};
