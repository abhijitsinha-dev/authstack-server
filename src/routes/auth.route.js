import { Router } from 'express';
import {
  requestOtp,
  resendOtp,
  verifyOtp,
  login,
  logout,
  refreshTokenController,
  getMe,
  forgotPassword,
  resetPasswordController,
} from '../controllers/auth.controller.js';
import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';
import { validate } from '../middlewares/validate.middleware.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';
const DEV_LIMIT = 100;

// ─────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────
router.route('/signup/request-otp').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:req-otp',
  }),
  validate(requestOtpSchema),
  requestOtp
);

// 1 per 20s aligns with the per-email cooldown in the service layer
router.route('/signup/resend-otp').post(
  rateLimit({
    limit: isProduction ? 1 : DEV_LIMIT,
    window: '20 s',
    prefix: 'ratelimit:resend-otp',
  }),
  validate(resendOtpSchema),
  resendOtp
);

router.route('/signup/verify-otp').post(
  rateLimit({
    limit: isProduction ? 10 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:verify-otp',
  }),
  validate(verifyOtpSchema),
  verifyOtp
);

// ─────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────
router.route('/login').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:login',
  }),
  validate(loginSchema),
  login
);

// No `protect`: the access token is expired by definition — that's why the
// client is calling. No `validate`: the JWT signature IS the validation.
// 30/min because this fires automatically on every cold start and every
// 15-minute access-token expiry — high-frequency by design.
router.route('/refresh').post(
  rateLimit({
    limit: isProduction ? 30 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:refresh',
  }),
  refreshTokenController
);

// Protected: `protect` validates the access token + session, then `getMe`
// does a second DB read for the full user profile. 60/min is generous for
// real clients (called on cold start and profile views) but caps the damage
// from a stolen access token being replayed.
router.route('/me').get(
  rateLimit({
    limit: isProduction ? 60 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:me',
  }),
  protect,
  getMe
);

// Rate limit BEFORE protect: unauthenticated spam should also be capped
// (protect does a Session.findById lookup on every valid-signature token).
router.route('/logout').post(
  rateLimit({
    limit: isProduction ? 20 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:logout',
  }),
  protect,
  logout
);

// ─────────────────────────────────────────────
// Password reset
// ─────────────────────────────────────────────
// See ADR-003: per-IP rate limit (here) + per-email 20s cooldown (service layer)
// cover both single-IP spam and VPN-hopping inbox attacks. Neither alone is enough.
router.route('/forgot-password').post(
  rateLimit({
    limit: isProduction ? 3 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:forgot-password',
  }),
  validate(forgotPasswordSchema),
  forgotPassword
);

router.route('/reset-password').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:reset-password',
  }),
  validate(resetPasswordSchema),
  resetPasswordController
);

export default router;
