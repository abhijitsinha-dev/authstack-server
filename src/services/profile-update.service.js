import User from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

export const updateProfile = async ({ userId, updates }) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }

  Object.assign(user, updates);
  await user.save();

  logger.info(`Profile updated for user ${userId}.`);
  return Object.fromEntries(Object.keys(updates).map((field) => [field, user[field]]));
};
