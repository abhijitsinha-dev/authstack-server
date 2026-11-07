import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import { generateHashedOtp } from '../utils/otp.js';
import { emailQueue } from '../queues/email.queue.js';
import { sendSignupOtpEmail } from './email.service.js'; // <-- Import the email service
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

export const requestSignupOtp = async ({ name, email, password }) => {
  // 1. Check if the user already exists and is verified
  const existingUser = await User.findOne({ email });

  if (existingUser && existingUser.isVerified) {
    throw new ApiError(409, 'An account with this email already exists. Please log in.');
  }

  // 2. If user exists but is NOT verified, delete them so we can start fresh
  if (existingUser && !existingUser.isVerified) {
    await User.deleteOne({ _id: existingUser._id });
  }

  // 3. Create the unverified user (password gets hashed by the model hook)
  await User.create({ name, email, password });

  // 4. Generate a secure OTP and hash it using bcrypt
  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // 5. Upsert the OTP in the database
  await Otp.deleteMany({ email });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt });

  // 6. Push the email task to the BullMQ queue (Asynchronous - fast API response)
  await emailQueue.add('send-otp', {
    email,
    name,
    otp,
  });
};

export const resendSignupOtp = async ({ email }) => {
  // 1. Check if user exists
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'User not found. Please sign up first.');
  }

  // 2. Check if user is already verified
  if (user.isVerified) {
    throw new ApiError(400, 'Account is already verified. Please log in.');
  }

  // 3. Rate Limiting (20-second cooldown)
  const existingOtp = await Otp.findOne({ email });
  if (existingOtp && existingOtp.createdAt) {
    const timeSinceLastRequest = Date.now() - existingOtp.createdAt.getTime();
    const cooldownMs = 20 * 1000;

    if (timeSinceLastRequest < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timeSinceLastRequest) / 1000);
      throw new ApiError(429, `Please wait ${secondsLeft} seconds before requesting a new code.`);
    }
  }

  // 4. Generate a new OTP and hash it
  const { otp, hashedOtp } = await generateHashedOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // 5. Replace the old OTP in the database
  await Otp.deleteMany({ email });
  await Otp.create({ email, codeHash: hashedOtp, expiresAt });

  // 6. Send the email SYNCHRONOUSLY (Await it)
  // If Brevo fails, this throws an ApiError (500) and the user knows immediately.
  await sendSignupOtpEmail(email, user.name, otp);

  logger.info(`Resent OTP email sent synchronously to ${email}`);
};
