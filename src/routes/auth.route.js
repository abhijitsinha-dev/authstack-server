import { Router } from 'express';
import {
  requestOtp,
  resendOtp,
  verifyOtp,
  login,
  logout,
  refreshTokenController,
  getMe,
  getSessions,
  revokeSessionController,
  revokeOtherSessionsController,
  changePasswordController,
  requestEmailChangeController,
  verifyEmailChangeController,
  forgotPassword,
  resetPasswordController,
} from '../controllers/auth.controller.js';
import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  changePasswordSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
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
router
  .route('/signup/request-otp')
  .post(
    rateLimit({ limit: isProduction ? 5 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:req-otp' }),
    validate(requestOtpSchema),
    requestOtp
  );

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
router
  .route('/login')
  .post(
    rateLimit({ limit: isProduction ? 5 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:login' }),
    validate(loginSchema),
    login
  );

router
  .route('/refresh')
  .post(
    rateLimit({ limit: isProduction ? 30 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:refresh' }),
    refreshTokenController
  );

router
  .route('/me')
  .get(
    rateLimit({ limit: isProduction ? 60 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:me' }),
    protect,
    getMe
  );

router
  .route('/sessions')
  .get(
    rateLimit({
      limit: isProduction ? 60 : DEV_LIMIT,
      window: '1 m',
      prefix: 'ratelimit:sessions-list',
    }),
    protect,
    getSessions
  )
  .delete(
    rateLimit({
      limit: isProduction ? 5 : DEV_LIMIT,
      window: '1 m',
      prefix: 'ratelimit:sessions-revoke-others',
    }),
    protect,
    revokeOtherSessionsController
  );

router.route('/sessions/:id').delete(
  rateLimit({
    limit: isProduction ? 10 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:sessions-revoke-one',
  }),
  protect,
  revokeSessionController
);

router
  .route('/logout')
  .post(
    rateLimit({ limit: isProduction ? 20 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:logout' }),
    protect,
    logout
  );

// ─────────────────────────────────────────────
// Email change
// ─────────────────────────────────────────────
// Tight IP rate limit because each request sends an OTP email (Brevo cost)
// and verifies the current password (bcrypt CPU). Cooldown in service layer
// is 20 seconds per user, matching resend-otp.
router.route('/change-email/request-otp').post(
  rateLimit({
    limit: isProduction ? 3 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-email-req',
  }),
  protect,
  validate(requestEmailChangeSchema),
  requestEmailChangeController
);

router.route('/change-email/verify-otp').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-email-verify',
  }),
  protect,
  validate(verifyEmailChangeSchema),
  verifyEmailChangeController
);

// ─────────────────────────────────────────────
// Password
// ─────────────────────────────────────────────
router.route('/change-password').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-password',
  }),
  protect,
  validate(changePasswordSchema),
  changePasswordController
);

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
