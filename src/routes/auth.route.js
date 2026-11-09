import { Router } from 'express';
import { requestOtp, resendOtp, verifyOtp } from '../controllers/auth.controller.js';
import {
  requestOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from '../validators/auth.validator.js';
import { validate } from '../middlewares/validate.middleware.js';
import { rateLimit } from '../middlewares/rateLimit.middleware.js';

const router = Router();
const isProduction = process.env.NODE_ENV === 'production';

/**
 * @swagger
 * /api/v1/auth/signup/request-otp:
 *   post:
 *     summary: Request an OTP for signup
 *     description: Creates an unverified user, generates a 6-digit OTP, and sends it via email.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Verification code sent to your email.
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *       400:
 *         description: Validation error (e.g., invalid email, weak password)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Password must be at least 8 characters long and contain at least one  uppercase letter, one lowercase letter, one number, and one symbol.
 *       409:
 *         description: Email already exists and is verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: An account with this email already exists. Please log in.
 *       429:
 *         description: Too many requests (Rate limited)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Too many requests. Please try again later.
 *       500:
 *         description: Server or email sending error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */
router.route('/signup/request-otp').post(
  // Allow 5 requests per 1 minute for OTP requests
  rateLimit({ limit: isProduction ? 5 : 100, window: '1 m', prefix: 'ratelimit:req-otp' }),
  validate(requestOtpSchema),
  requestOtp
);

/**
 * @swagger
 * /api/v1/auth/signup/resend-otp:
 *   post:
 *     summary: Resend signup OTP
 *     description: Generates a new OTP and sends it to the user's email. Enforces a 20-second cooldown.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *     responses:
 *       200:
 *         description: New OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: A new verification code has been sent to your email.
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *       400:
 *         description: User is already verified or invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Account is already verified. Please log in.
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User not found. Please sign up first.
 *       429:
 *         description: Rate limit exceeded (IP limit or 20-second email cooldown)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: |
 *                     The specific reason for the rate limit. Possible values:
 *                     - "Too many requests. Please try again later." (IP limit)
 *                     - "Please wait X seconds before requesting a new code." (Email cooldown)
 *                   example: Too many requests. Please try again later.
 *       500:
 *         description: Failed to send email via Brevo (Internal Server Error)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */
router.route('/signup/resend-otp').post(
  // Slightly stricter than request-otp to prevent DB hammering
  rateLimit({ limit: isProduction ? 1 : 100, window: '20 s', prefix: 'ratelimit:resend-otp' }),
  validate(resendOtpSchema),
  resendOtp
);

/**
 * @swagger
 * /api/v1/auth/signup/verify-otp:
 *   post:
 *     summary: Verify OTP and complete signup
 *     description: Verifies the 6-digit OTP. Marks the user as verified, creates a session, and issues JWT tokens. Web clients receive the refresh token as an HttpOnly cookie, while mobile clients receive it in the JSON body.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Successfully verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Account verified successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         name: { type: string }
 *                         email: { type: string }
 *                         role: { type: string }
 *                     accessToken:
 *                       type: string
 *       400:
 *         description: Invalid OTP or user already verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: |
 *                     The specific reason for the error. Possible values:
 *                     - "User is already verified. Please log in."
 *                     - "OTP has expired or does not exist. Please request a new one."
 *                     - "Invalid OTP code. You have X attempts remaining."
 *                   example: Invalid OTP code. You have 4 attempts remaining.
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User not found. Please request a new OTP.
 *       429:
 *         description: Maximum verification attempts exceeded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Maximum verification attempts exceeded. Please request a new OTP.
 */
router
  .route('/signup/verify-otp')
  .post(
    rateLimit({ limit: isProduction ? 10 : 100, window: '1 m', prefix: 'ratelimit:verify-otp' }),
    validate(verifyOtpSchema),
    verifyOtp
  );

export default router;
