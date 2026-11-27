import Joi from 'joi';
import {
  emailField,
  strongPasswordField,
  loginEmailField,
  loginPasswordField,
  RESERVED_USERNAMES,
} from './fields.js';

export const requestOtpSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(30)
    .pattern(/^[a-z0-9_.-]+$/)
    .invalid(...RESERVED_USERNAMES)
    .required()
    .messages({
      'any.required': 'Username is required.',
      'string.empty': 'Username is required.',
      'string.min': 'Username must be at least 3 characters long.',
      'string.max': 'Username must be at most 30 characters long.',
      'string.pattern.base': 'Username may only contain lowercase letters, numbers, and _, -, or .',
      'any.invalid': '{{#value}} is not allowed',
    }),
  email: emailField,
  password: strongPasswordField,
});

export const usernameAvailabilitySchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(30)
    .pattern(/^[a-z0-9_.-]+$/)
    .invalid(...RESERVED_USERNAMES)
    .required()
    .messages({
      'any.required': 'Username is required.',
      'string.empty': 'Username is required.',
      'string.min': 'Username must be at least 3 characters long.',
      'string.max': 'Username must be at most 30 characters long.',
      'string.pattern.base': 'Username may only contain lowercase letters, numbers, and _, -, or .',
      'any.invalid': '{{#value}} is not allowed',
    }),
});

export const emailAvailabilitySchema = Joi.object({
  email: emailField,
});

export const resendOtpSchema = Joi.object({
  email: emailField,
});

export const verifyOtpSchema = Joi.object({
  email: emailField,
  otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'any.required': 'OTP is required.',
    'string.empty': 'OTP is required.',
    'string.length': 'OTP must be exactly 6 digits.',
    'string.pattern.base': 'OTP must contain only numbers.',
  }),
});

export const loginSchema = Joi.object({
  email: loginEmailField,
  password: loginPasswordField,
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(72).required().messages({
    'any.required': 'Current password is required.',
    'string.empty': 'Current password is required.',
    'string.max': 'Current password must be at most 72 characters long.',
  }),
  newPassword: strongPasswordField,
  confirmPassword: Joi.string()
    .min(8)
    .max(72)
    .required()
    .custom((value, helpers) => {
      const { newPassword } = helpers.state.ancestors[0];
      if (value !== newPassword) {
        return helpers.error('any.only');
      }
      return value;
    })
    .messages({
      'any.only': 'Passwords do not match.',
      'any.required': 'Please confirm your new password.',
      'string.empty': 'Please confirm your new password.',
      'string.min': 'Password must be at least 8 characters long.',
      'string.max': 'Password must be at most 72 characters long.',
    }),
});

// ─────────────────────────────────────────────
// NEW: email change
// ─────────────────────────────────────────────
export const requestEmailChangeSchema = Joi.object({
  newEmail: emailField,
  currentPassword: Joi.string().max(72).required().messages({
    'any.required': 'Current password is required.',
    'string.empty': 'Current password is required.',
    'string.max': 'Current password must be at most 72 characters long.',
  }),
});

export const verifyEmailChangeSchema = Joi.object({
  newEmail: emailField,
  otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'any.required': 'OTP is required.',
    'string.empty': 'OTP is required.',
    'string.length': 'OTP must be exactly 6 digits.',
    'string.pattern.base': 'OTP must contain only numbers.',
  }),
});

export const forgotPasswordSchema = Joi.object({
  email: emailField,
});

export const resetPasswordSchema = Joi.object({
  email: emailField,
  otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'any.required': 'OTP is required.',
    'string.empty': 'OTP is required.',
    'string.length': 'OTP must be exactly 6 digits.',
    'string.pattern.base': 'OTP must contain only numbers.',
  }),
  newPassword: strongPasswordField,
  confirmPassword: Joi.string()
    .min(8)
    .max(72)
    .required()
    .custom((value, helpers) => {
      const { newPassword } = helpers.state.ancestors[0];
      if (value !== newPassword) {
        return helpers.error('any.only');
      }
      return value;
    })
    .messages({
      'any.only': 'Passwords do not match.',
      'any.required': 'Please confirm your password.',
      'string.empty': 'Please confirm your password.',
      'string.min': 'Password must be at least 8 characters long.',
      'string.max': 'Password must be at most 72 characters long.',
    }),
});
