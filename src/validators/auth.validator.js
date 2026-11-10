import Joi from 'joi';
import { emailField, strongPasswordField, loginEmailField, loginPasswordField } from './fields.js';

export const requestOtpSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required().messages({
    'any.required': 'Name is required.',
    'string.empty': 'Name is required.',
    'string.min': 'Name must be at least 2 characters long.',
    'string.max': 'Name must be less than 50 characters long.',
  }),
  email: emailField,
  password: strongPasswordField,
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
