import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/services/signup.service.js', () => ({
  requestSignupOtp: jest.fn(),
  resendSignupOtp: jest.fn(),
  verifySignupOtp: jest.fn(),
  isUsernameAvailable: jest.fn(),
  isEmailAvailable: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/session.service.js', () => ({
  loginUser: jest.fn(),
  logoutUser: jest.fn(),
  refreshTokens: jest.fn(),
  getCurrentUser: jest.fn(),
  listUserSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeOtherSessions: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/password.service.js', () => ({
  changePassword: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/email-change.service.js', () => ({
  requestEmailChange: jest.fn(),
  verifyEmailChange: jest.fn(),
}));
jest.unstable_mockModule('../../src/services/username-change.service.js', () => ({
  changeUsername: jest.fn(),
}));

const { changeUsername } = await import('../../src/services/username-change.service.js');
const { changeUsernameController } =
  await import('../../src/controllers/username-change.controller.js');

describe('username-change.controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: { newUsername: 'new_name' },
      user: { id: 'u1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('should change the authenticated user username and return it', async () => {
    changeUsername.mockResolvedValue({ username: 'new_name' });

    await changeUsernameController(req, res);

    expect(changeUsername).toHaveBeenCalledWith({ userId: 'u1', newUsername: 'new_name' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Username changed successfully.',
      data: { username: 'new_name' },
    });
  });

  it('should propagate service errors without sending a success response', async () => {
    changeUsername.mockRejectedValue(new Error('This username is already in use.'));

    await expect(changeUsernameController(req, res)).rejects.toThrow(
      'This username is already in use.'
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
