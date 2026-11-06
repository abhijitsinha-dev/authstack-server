import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import { generateHashedOtp } from '../utils/token.js';
import { emailQueue } from '../queues/email.queue.js'; // <-- Import the queue
import { ApiError } from '../utils/ApiError.js';

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

  // 6. Push the email task to the BullMQ queue (Non-blocking)
  await emailQueue.add('send-otp', {
    email,
    name,
    otp, // The plain text OTP is passed to the worker to be emailed
  });
};
