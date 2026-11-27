import Joi from 'joi';
import isStrongPassword from 'validator/lib/isStrongPassword.js';

export const RESERVED_USERNAMES = new Set([
  'admin',
  'support',
  'root',
  'api',
  'help',
  'security',
  'noreply',
  'postmaster',
]);

export const emailField = Joi.string()
  .min(5)
  .max(254)
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    'any.required': 'Email is required.',
    'string.empty': 'Email is required.',
    'string.min': 'Email must be at least 5 characters long.',
    'string.max': 'Email must be at most 254 characters long.',
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
    'string.max': 'Password must be at most 72 characters long.',
  });

export const loginEmailField = Joi.string().min(5).max(254).email().lowercase().trim().messages({
  'string.base': 'Invalid email or password.',
  'string.empty': 'Invalid email or password.',
  'string.min': 'Invalid email or password.',
  'string.max': 'Invalid email or password.',
  'string.email': 'Invalid email or password.',
});

export const loginUsernameField = Joi.string()
  .min(3)
  .max(30)
  .pattern(/^[a-z0-9_.-]+$/)
  .lowercase()
  .trim()
  .messages({
    'string.base': 'Invalid email or password.',
    'string.empty': 'Invalid email or password.',
    'string.min': 'Invalid email or password.',
    'string.max': 'Invalid email or password.',
    'string.pattern.base': 'Invalid email or password.',
  });

export const loginPasswordField = Joi.string().max(72).required().messages({
  'any.required': 'Password is required.',
  'string.empty': 'Password is required.',
  'string.max': 'Invalid email or password.',
});
