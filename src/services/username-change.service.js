import User from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

export const changeUsername = async ({ userId, newUsername }) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(401, 'Session is no longer valid. Please log in again.');
  }

  if (user.username === newUsername) {
    throw new ApiError(400, 'New username must be different from current username.');
  }

  const existingUser = await User.findOne({ username: newUsername });
  if (existingUser) {
    throw new ApiError(409, 'This username is already in use.');
  }

  user.username = newUsername;

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'This username is already in use.');
    }
    throw err;
  }

  logger.info(`Username changed for user ${userId}.`);
  return { username: user.username };
};
