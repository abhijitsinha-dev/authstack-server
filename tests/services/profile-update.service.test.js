import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/models/user.model.js', () => ({
  default: {
    findById: jest.fn(),
  },
}));
jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn() },
}));

const { default: User } = await import('../../src/models/user.model.js');
const { logger } = await import('../../src/config/logger.js');
const { updateProfile } = await import('../../src/services/profile-update.service.js');

describe('profile-update.service', () => {
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { _id: 'u1', name: 'Old Name', save: jest.fn() };
    User.findById.mockResolvedValue(mockUser);
  });

  it('should throw 401 if the authenticated user no longer exists', async () => {
    User.findById.mockResolvedValue(null);

    await expect(updateProfile({ userId: 'u1', updates: { name: 'New Name' } })).rejects.toThrow(
      'Session is no longer valid'
    );
    expect(mockUser.save).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('updates and saves the supplied profile fields', async () => {
    const result = await updateProfile({ userId: 'u1', updates: { name: 'New Name' } });

    expect(User.findById).toHaveBeenCalledWith('u1');
    expect(mockUser.name).toBe('New Name');
    expect(mockUser.save).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Profile updated for user u1.');
    expect(result).toEqual({ name: 'New Name' });
  });

  it('propagates persistence errors', async () => {
    mockUser.save.mockRejectedValue(new Error('Database unavailable.'));

    await expect(updateProfile({ userId: 'u1', updates: { name: 'New Name' } })).rejects.toThrow(
      'Database unavailable.'
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
