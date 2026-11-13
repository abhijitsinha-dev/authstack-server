import mongoose from 'mongoose';
import { isEmail } from '../utils/validator.js';

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: isEmail,
        message: 'Please provide a valid email address.',
      },
    },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    purpose: {
      type: String,
      enum: ['signup', 'reset'],
      required: true,
    },
  },
  { timestamps: true }
);

otpSchema.index({ email: 1, purpose: 1 });

// MongoDB TTL index: automatically delete document when expiresAt is reached
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Otp', otpSchema);
