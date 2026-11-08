import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: validator.isEmail,
        message: 'Please provide a valid email address.',
      },
    },
    password: {
      type: String,
      required: true,
      select: false,
      validate: {
        // Must be a regular function to access `this`
        validator: function (value) {
          // Only validate if the password is new or being changed
          if (!this.isModified('password')) return true;

          // Uses default rules: 8 chars, 1 lowercase, 1 uppercase, 1 number, 1 symbol
          return validator.isStrongPassword(value);
        },
        message:
          'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol.',
      },
    },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);
});

export default mongoose.model('User', userSchema);
