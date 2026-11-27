// src/middlewares/validate.middleware.js
import { ApiError } from '../utils/ApiError.js';

export const validateBody = (schema) => (req, _res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });
  if (error) return next(new ApiError(400, error.details[0].message));
  req.body = value;
  next();
};

export const validateQuery = (schema) => (req, _res, next) => {
  const { error, value } = schema.validate(req.query, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });
  if (error) return next(new ApiError(400, error.details[0].message));
  req.validatedQuery = value;
  next();
};
