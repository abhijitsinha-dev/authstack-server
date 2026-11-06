import Joi from 'joi';

export const requestOtpSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string()
    .min(8)
    .max(72)
    .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one letter and one number',
    }),
});
