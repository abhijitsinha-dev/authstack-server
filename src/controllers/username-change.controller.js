import { changeUsername } from '../services/index.js';

export const changeUsernameController = async (req, res) => {
  const { newUsername } = req.body;
  const { username } = await changeUsername({ userId: req.user.id, newUsername });
  res.status(200).json({
    success: true,
    message: 'Username changed successfully.',
    data: { username },
  });
};
