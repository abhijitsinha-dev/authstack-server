import { changePassword, requestPasswordReset, resetPassword } from '../services/index.js';

export const changePasswordController = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { revokedCount } = await changePassword({
    userId: req.user.id,
    currentSessionId: req.user.sessionId,
    currentPassword,
    newPassword,
  });
  res.status(200).json({
    success: true,
    message:
      revokedCount > 0
        ? 'Password changed. Other devices have been logged out.'
        : 'Password changed successfully.',
    data: { revokedCount },
  });
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  await requestPasswordReset({ email });
  res.status(200).json({
    success: true,
    message: 'If an account exists with that email, a password reset code has been sent.',
  });
};

export const resetPasswordController = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  await resetPassword({ email, otp, newPassword });
  res.status(200).json({
    success: true,
    message: 'Password reset successfully. Please log in with your new password.',
  });
};
