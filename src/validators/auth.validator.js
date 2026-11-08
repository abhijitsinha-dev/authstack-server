import Joi from 'joi';
import { isStrongPassword } from '../utils/validator.js';

export const requestOtpSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string()
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
    }),
});

export const resendOtpSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'Please provide a valid email address.',
    'any.required': 'Email is required.',
  }),
});
