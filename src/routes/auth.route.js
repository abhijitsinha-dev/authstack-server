import { Router } from 'express';
import {
  requestOtp,
  resendOtp,
  verifyOtp,
  checkUsernameAvailability,
  checkEmailAvailability,
  login,
  logout,
  refreshTokenController,
  getMe,
  getSessions,
  revokeSessionController,
  revokeOtherSessionsController,
  changePasswordController,
  changeUsernameController,
  requestEmailChangeController,
  verifyEmailChangeController,
  forgotPassword,
  resetPasswordController,
} from '../controllers/index.js';
import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  loginSchema,
  changePasswordSchema,
  changeUsernameSchema,
  requestEmailChangeSchema,
  verifyEmailChangeSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  usernameAvailabilitySchema,
  emailAvailabilitySchema,
} from '../validators/auth.validator.js';
import { validateBody, validateQuery } from '../middlewares/validate.middleware.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';
const DEV_LIMIT = 100;

// ─────────────────────────────────────────────
// Signup
// ─────────────────────────────────────────────
router.get(
  '/username-availability',
  rateLimit({
    limit: isProduction ? 10 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:username-availability',
  }),
  validateQuery(usernameAvailabilitySchema),
  checkUsernameAvailability
);

router.get(
  '/email-availability',
  rateLimit({
    limit: isProduction ? 10 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:email-availability',
  }),
  validateQuery(emailAvailabilitySchema),
  checkEmailAvailability
);

router
  .route('/signup/request-otp')
  .post(
    rateLimit({ limit: isProduction ? 5 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:req-otp' }),
    validateBody(requestOtpSchema),
    requestOtp
  );

router.route('/signup/resend-otp').post(
  rateLimit({
    limit: isProduction ? 1 : DEV_LIMIT,
    window: '20 s',
    prefix: 'ratelimit:resend-otp',
  }),
  validateBody(resendOtpSchema),
  resendOtp
);

router.route('/signup/verify-otp').post(
  rateLimit({
    limit: isProduction ? 10 : DEV_LIMIT,
    window: '1 m',
    prefix: 'ratelimit:verify-otp',
  }),
  validateBody(verifyOtpSchema),
  verifyOtp
);

// ─────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────
router
  .route('/login')
  .post(
    rateLimit({ limit: isProduction ? 5 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:login' }),
    validateBody(loginSchema),
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
// Username change
// ─────────────────────────────────────────────
router.route('/change-username').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-username',
  }),
  protect,
  validateBody(changeUsernameSchema),
  changeUsernameController
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
  validateBody(requestEmailChangeSchema),
  requestEmailChangeController
);

router.route('/change-email/verify-otp').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-email-verify',
  }),
  protect,
  validateBody(verifyEmailChangeSchema),
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
  validateBody(changePasswordSchema),
  changePasswordController
);

router.route('/forgot-password').post(
  rateLimit({
    limit: isProduction ? 3 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:forgot-password',
  }),
  validateBody(forgotPasswordSchema),
  forgotPassword
);

router.route('/reset-password').post(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:reset-password',
  }),
  validateBody(resetPasswordSchema),
  resetPasswordController
);

export default router;
