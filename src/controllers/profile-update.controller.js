import { updateProfile } from '../services/index.js';

export const updateProfileController = async (req, res) => {
  const updatedFields = await updateProfile({ userId: req.user.id, updates: req.body });
  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    data: updatedFields,
  });
};
