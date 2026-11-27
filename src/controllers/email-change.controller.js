import { requestEmailChange, verifyEmailChange } from '../services/index.js';

export const requestEmailChangeController = async (req, res) => {
  const { newEmail, currentPassword } = req.body;
  await requestEmailChange({ userId: req.user.id, newEmail, currentPassword });
  res.status(200).json({
    success: true,
    message: 'Verification code sent to your new email.',
    data: { newEmail },
  });
};

export const verifyEmailChangeController = async (req, res) => {
  const { newEmail, otp } = req.body;
  const { revokedCount } = await verifyEmailChange({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
    newEmail,
    otp,
  });
  res.status(200).json({
    success: true,
    message:
      revokedCount > 0
        ? 'Email changed. Other devices have been logged out.'
        : 'Email changed successfully.',
    data: { revokedCount, newEmail },
  });
};
