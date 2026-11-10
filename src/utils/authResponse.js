// src/utils/authResponse.js

/**
 * Sends the auth response tailored to the client type (Web vs Mobile).
 * Web clients receive the refresh token as an HttpOnly cookie.
 * Mobile clients receive both tokens in the JSON body.
 */
export const sendAuthResponse = (req, res, user, accessToken, refreshToken, message) => {
  const isMobile = req.headers['user-agent']?.match(/mobile|android|iphone/i);
  const userResponse = { id: user._id, name: user.name, email: user.email, role: user.role };

  if (isMobile) {
    return res.status(200).json({
      success: true,
      message,
      data: { user: userResponse, accessToken, refreshToken },
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
    message,
    data: { user: userResponse, accessToken },
  });
};
