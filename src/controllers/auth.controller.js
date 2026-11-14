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
  requestPasswordReset,
  resetPassword,
} from '../services/auth.service.js';
import { sendAuthResponse } from '../utils/authResponse.js';

export const requestOtp = async (req, res) => {
  const { name, email, password } = req.body;

  // Call the service
  await requestSignupOtp({ name, email, password });

  // Send success response
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

/**
 * Rotate the refresh token and return a new access token.
 */
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

/**
 * Return the authenticated user's profile.
 */
export const getMe = async (req, res) => {
  const user = await getCurrentUser({ userId: req.user.id });

  res.setHeader('Cache-Control', 'no-store');

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    },
  });
};

/**
 * List all active sessions for the authenticated user.
 */
export const getSessions = async (req, res) => {
  const sessions = await listUserSessions({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
  });

  res.setHeader('Cache-Control', 'no-store');

  res.status(200).json({
    success: true,
    data: { sessions },
  });
};

/**
 * Revoke a specific session by ID.
 */
export const revokeSessionController = async (req, res) => {
  await revokeSession({
    sessionId: req.params.id,
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
  });

  res.status(200).json({
    success: true,
    message: 'Session revoked successfully.',
  });
};

/**
 * Revoke all sessions except the current one.
 */
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

/**
 * Change the authenticated user's password.
 *
 * Requires currentPassword (proof of identity, not just session) and
 * revokes all OTHER sessions on success. The current session stays active
 * so the user isn't logged out of the device where they're doing this.
 */
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

export const logout = async (req, res) => {
  // Revoke the session in the database
  await logoutUser(req.user.sessionId);

  // Clear the HttpOnly cookie (for Web clients)
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  // For Mobile clients, they will just delete the token from SecureStore on their end
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  // Service handles the check to not leak email existence
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
