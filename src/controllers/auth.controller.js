import { requestSignupOtp, resendSignupOtp } from '../services/auth.service.js';

export const requestOtp = async (req, res) => {
  const { name, email, password } = req.body;

  // Call the service
  await requestSignupOtp({ name, email, password });

  // Send success response
  res.status(200).json({
    success: true,
    message: 'Verification code sent to your email.',
    data: { email },
  });
};

export const resendOtp = async (req, res) => {
  const { email } = req.body;

  await resendSignupOtp({ email });

  res.status(200).json({
    success: true,
    message: 'A new verification code has been sent to your email.',
    data: { email },
  });
};
