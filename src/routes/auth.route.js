import { Router } from 'express';
import { requestOtp, resendOtp, verifyOtp, login, logout } from '../controllers/auth.controller.js';
import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
  loginSchema,
} from '../validators/auth.validator.js';
import { validate } from '../middlewares/validate.middleware.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

router
  .route('/signup/request-otp')
  .post(
    rateLimit({ limit: isProduction ? 5 : 100, window: '1 m', prefix: 'ratelimit:req-otp' }),
    validate(requestOtpSchema),
    requestOtp
  );

router
  .route('/signup/resend-otp')
  .post(
    rateLimit({ limit: isProduction ? 1 : 100, window: '20 s', prefix: 'ratelimit:resend-otp' }),
    validate(resendOtpSchema),
    resendOtp
  );

router
  .route('/signup/verify-otp')
  .post(
    rateLimit({ limit: isProduction ? 10 : 100, window: '1 m', prefix: 'ratelimit:verify-otp' }),
    validate(verifyOtpSchema),
    verifyOtp
  );

router
  .route('/login')
  .post(
    rateLimit({ limit: isProduction ? 5 : 100, window: '1 m', prefix: 'ratelimit:login' }),
    validate(loginSchema),
    login
  );

router.route('/logout').post(protect, logout);

export default router;
