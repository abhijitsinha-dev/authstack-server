import { Router } from 'express';
import { requestOtp } from '../controllers/auth.controller.js';
import { requestOtpSchema } from '../validators/auth.validator.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

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
 *                 example: Password123
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Verification code sent to your email. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     email: { type: string, example: john@example.com }
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists and is verified
 *       500:
 *         description: Server or email sending error
 */
router.route('/signup/request-otp').post(validate(requestOtpSchema), requestOtp);

export default router;
