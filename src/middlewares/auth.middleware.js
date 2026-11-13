import jwt from 'jsonwebtoken';
import Session from '../models/session.model.js';
import { ApiError } from '../utils/ApiError.js';

export const protect = async (req, _res, next) => {
  // 1. Get token from header
  const authHeader = req.headers.authorization;
  const token =
    authHeader && /^bearer\s+/i.test(authHeader) ? authHeader.replace(/^bearer\s+/i, '') : null;

  if (!token) {
    throw new ApiError(401, 'Not authorized, no token provided');
  }

  // 2. Verify token signature and expiry
  let payload;
  try {
    payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    // We catch this here to throw our custom ApiError instead of a raw JWT error
    throw new ApiError(401, 'Not authorized, token failed or expired');
  }

  // 3. Check if the session is still active in the database
  const session = await Session.findById(payload.sid);

  if (!session || session.isRevoked) {
    throw new ApiError(401, 'Session has been revoked or expired');
  }

  // 4. Attach user data to the request
  req.user = {
    id: payload.sub,
    sessionId: payload.sid,
    role: payload.role || 'user',
  };

  next();
};
