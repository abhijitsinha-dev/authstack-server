import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { isEmail, isStrongPassword } from '../utils/validator.js';
import { RESERVED_USERNAMES } from '../validators/fields.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name must be at most 100 characters long.'],
    },
    username: {
      type: String,
      required: true,
      unique: true,
      minlength: [3, 'Username must be at least 3 characters long.'],
      maxlength: [30, 'Username must be at most 30 characters long.'],
      match: [
        /^[a-z0-9_.-]+$/,
        'Username may only contain lowercase letters, numbers, and _, -, or .',
      ],
      lowercase: true,
      validate: {
        validator: (username) => !RESERVED_USERNAMES.has(username),
        message: ({ value }) => `${value} is not allowed`,
      },
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [5, 'Email must be at least 5 characters long.'],
      maxlength: [254, 'Email must be at most 254 characters long.'],
      validate: {
        validator: isEmail,
        message: 'Please provide a valid email address.',
      },
    },
    password: {
      type: String,
      required: true,
      select: false,
      minlength: [8, 'Password must be at least 8 characters long.'],
      maxlength: [72, 'Password must be at most 72 characters long.'],
      validate: {
        // Must be a regular function to access `this`
        validator: function (value) {
          // Only validate if the password is new or being changed
          if (!this.isModified('password')) return true;

          // Uses default rules: 8 chars, 1 lowercase, 1 uppercase, 1 number, 1 symbol
          return isStrongPassword(value);
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

userSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { isVerified: false } }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);
});

export default mongoose.model('User', userSchema);
