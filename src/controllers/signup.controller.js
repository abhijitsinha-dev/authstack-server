import {
  requestSignupOtp,
  resendSignupOtp,
  verifySignupOtp,
  isUsernameAvailable,
  isEmailAvailable,
} from '../services/index.js';
import { sendAuthResponse } from '../utils/authResponse.js';

export const checkUsernameAvailability = async (req, res) => {
  const available = await isUsernameAvailable({ username: req.validatedQuery.username });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { available } });
};

export const checkEmailAvailability = async (req, res) => {
  const available = await isEmailAvailable({ email: req.validatedQuery.email });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ success: true, data: { available } });
};

export const requestOtp = async (req, res) => {
  const { username, email, password } = req.body;
  await requestSignupOtp({ username, email, password });
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
