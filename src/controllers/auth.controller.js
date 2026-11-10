import {
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  loginUser,
  logoutUser,
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
