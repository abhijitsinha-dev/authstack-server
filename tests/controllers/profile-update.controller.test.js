import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/services/index.js', () => ({
  updateProfile: jest.fn(),
}));

const { updateProfile } = await import('../../src/services/index.js');
const { updateProfileController } =
  await import('../../src/controllers/profile-update.controller.js');

describe('profile-update.controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: { name: 'New Name' },
      user: { id: 'u1' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('updates the authenticated user profile and returns the changed fields', async () => {
    updateProfile.mockResolvedValue({ name: 'New Name' });

    await updateProfileController(req, res);

    expect(updateProfile).toHaveBeenCalledWith({ userId: 'u1', updates: { name: 'New Name' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Profile updated successfully.',
      data: { name: 'New Name' },
    });
  });

  it('propagates service errors without sending a success response', async () => {
    updateProfile.mockRejectedValue(new Error('Database unavailable.'));

    await expect(updateProfileController(req, res)).rejects.toThrow('Database unavailable.');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
