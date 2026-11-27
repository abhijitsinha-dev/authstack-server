import { jest } from '@jest/globals';

jest.unstable_mockModule('../../src/models/user.model.js', () => ({
  default: {
    findById: jest.fn(),
    findOne: jest.fn(),
  },
}));
jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: { info: jest.fn() },
}));

const { default: User } = await import('../../src/models/user.model.js');
const { changeUsername } = await import('../../src/services/username-change.service.js');

describe('username-change.service', () => {
  let mockUser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { _id: 'u1', username: 'old_name', save: jest.fn() };
    User.findById.mockResolvedValue(mockUser);
    User.findOne.mockResolvedValue(null);
  });

  it('should throw 401 if the authenticated user no longer exists', async () => {
    User.findById.mockResolvedValue(null);

    await expect(changeUsername({ userId: 'u1', newUsername: 'new_name' })).rejects.toThrow(
      'Session is no longer valid'
    );
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it('should reject the current username as a no-op', async () => {
    await expect(changeUsername({ userId: 'u1', newUsername: 'old_name' })).rejects.toThrow(
      'New username must be different from current username.'
    );
    expect(User.findOne).not.toHaveBeenCalled();
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('should reject a username owned by another account', async () => {
    User.findOne.mockResolvedValue({ _id: 'other-user', username: 'new_name' });

    await expect(changeUsername({ userId: 'u1', newUsername: 'new_name' })).rejects.toThrow(
      'This username is already in use.'
    );
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  it('should update and return the new username', async () => {
    const result = await changeUsername({ userId: 'u1', newUsername: 'new_name' });

    expect(User.findOne).toHaveBeenCalledWith({ username: 'new_name' });
    expect(mockUser.username).toBe('new_name');
    expect(mockUser.save).toHaveBeenCalled();
    expect(result).toEqual({ username: 'new_name' });
  });

  it('should return a conflict if another account claims the username concurrently', async () => {
    const duplicateKeyError = new Error('duplicate key');
    duplicateKeyError.code = 11000;
    mockUser.save.mockRejectedValue(duplicateKeyError);

    await expect(changeUsername({ userId: 'u1', newUsername: 'new_name' })).rejects.toThrow(
      'This username is already in use.'
    );
  });
});
