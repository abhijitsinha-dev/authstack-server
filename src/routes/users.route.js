import { Router } from 'express';
import {
  changePasswordController,
  changeUsernameController,
  getMe,
  requestEmailChangeController,
  updateProfileController,
  verifyEmailChangeController,
} from '../controllers/index.js';
import {
  changePasswordSchema,
  changeUsernameSchema,
  requestEmailChangeSchema,
  updateProfileSchema,
  verifyEmailChangeSchema,
} from '../validators/auth.validator.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';
const DEV_LIMIT = 100;

router
  .route('/me')
  .get(
    rateLimit({ limit: isProduction ? 60 : DEV_LIMIT, window: '1 m', prefix: 'ratelimit:me' }),
    protect,
    getMe
  )
  .patch(
    rateLimit({
      limit: isProduction ? 10 : DEV_LIMIT,
      window: '15 m',
      prefix: 'ratelimit:update-profile',
    }),
    protect,
    validateBody(updateProfileSchema),
    updateProfileController
  );

router.route('/me/username').patch(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-username',
  }),
  protect,
  validateBody(changeUsernameSchema),
  changeUsernameController
);

router.route('/me/email').patch(
  rateLimit({
    limit: isProduction ? 3 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-email-req',
  }),
  protect,
  validateBody(requestEmailChangeSchema),
  requestEmailChangeController
);

router.route('/me/email/verify-otp').patch(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-email-verify',
  }),
  protect,
  validateBody(verifyEmailChangeSchema),
  verifyEmailChangeController
);

router.route('/me/password').patch(
  rateLimit({
    limit: isProduction ? 5 : DEV_LIMIT,
    window: '15 m',
    prefix: 'ratelimit:change-password',
  }),
  protect,
  validateBody(changePasswordSchema),
  changePasswordController
);

export default router;
