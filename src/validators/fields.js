import Joi from 'joi';
import isStrongPassword from 'validator/lib/isStrongPassword.js';

export const emailField = Joi.string().email().lowercase().trim().required().messages({
  'any.required': 'Email is required.',
  'string.empty': 'Email is required.',
  'string.email': 'Please provide a valid email address.',
});

export const strongPasswordField = Joi.string()
  .min(8)
  .max(72)
  .required()
  .custom((value, helpers) => {
    if (!isStrongPassword(value)) {
      return helpers.message({
        custom:
          'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol.',
      });
    }
    return value;
  })
  .messages({
    'any.required': 'Password is required.',
    'string.empty': 'Password is required.',
    'string.min': 'Password must be at least 8 characters long.',
    'string.max': 'Password must be less than 72 characters long.',
  });

export const loginEmailField = Joi.string().email().lowercase().trim().required().messages({
  'any.required': 'Email is required.',
  'string.empty': 'Email is required.',
  'string.email': 'Invalid email or password.',
});

export const loginPasswordField = Joi.string().required().messages({
  'any.required': 'Password is required.',
  'string.empty': 'Password is required.',
});
