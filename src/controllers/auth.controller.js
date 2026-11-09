import { requestSignupOtp, resendSignupOtp, verifySignupOtp } from '../services/auth.service.js';

export const requestOtp = async (req, res) => {
  const { name, email, password } = req.body;

  // Call the service
  await requestSignupOtp({ name, email, password });

  // Send success response
  res.status(200).json({
    success: true,
    message: 'Verification code sent to your email.',
    data: { email },
  });
};

export const resendOtp = async (req, res) => {
  const { email } = req.body;

  await resendSignupOtp({ email });

  res.status(200).json({
    success: true,
    message: 'A new verification code has been sent to your email.',
    data: { email },
  });
};

export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];

  const { user, accessToken, refreshToken } = await verifySignupOtp({
    email,
    otp,
    ip,
    userAgent,
  });

  // Basic mobile detection (React Native clients send a specific UA or custom header)
  const isMobile = userAgent && /mobile|android|iphone/i.test(userAgent);

  const userResponse = { id: user._id, name: user.name, email: user.email, role: user.role };

  if (isMobile) {
    // Mobile: Return both tokens in JSON (to be saved in SecureStore)
    return res.status(200).json({
      success: true,
      message: 'Account verified successfully.',
      data: { user: userResponse, accessToken, refreshToken },
    });
  }

  // Web: Return access token in JSON, set refresh token as HttpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: (Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({
    success: true,
    message: 'Account verified successfully.',
    data: { user: userResponse, accessToken },
  });
};
