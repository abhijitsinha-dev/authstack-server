import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import User from '../../src/models/user.model.js';

let mongoServer;

// Setup: Spin up the in-memory DB before all tests in this file
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

// Teardown: Disconnect and stop the DB after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Clean up the database between tests
afterEach(async () => {
  await User.deleteMany({});
});

describe('User Model', () => {
  const validUser = {
    username: 'john_doe.1-a',
    email: 'john@example.com',
    password: 'Password123!',
  };
  const maxLengthEmail = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(62)}`;

  it('should expire unverified accounts 24 hours after creation', () => {
    const ttlIndex = User.schema.indexes().find(([indexKeys]) => indexKeys.createdAt === 1);

    expect(ttlIndex).toBeDefined();
    expect(ttlIndex[0]).toEqual({ createdAt: 1 });
    expect(ttlIndex[1]).toMatchObject({
      expireAfterSeconds: 24 * 60 * 60,
      partialFilterExpression: { isVerified: false },
    });
  });

  it('should allow name to be omitted', async () => {
    const user = new User(validUser);

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it('should require a username', async () => {
    const userWithoutUsername = {
      email: validUser.email,
      password: validUser.password,
    };
    const user = new User(userWithoutUsername);

    await expect(user.validate()).rejects.toMatchObject({
      errors: { username: expect.any(Object) },
    });
  });

  it.each([
    ['username', 'ab', 'minlength'],
    ['username', 'a'.repeat(31), 'maxlength'],
    ['email', 'a@b', 'minlength'],
    ['email', maxLengthEmail, 'maxlength'],
    ['password', 'Ab1!xyz', 'minlength'],
    ['password', `A1!${'a'.repeat(70)}`, 'maxlength'],
  ])('should enforce %s length limits', async (field, value, validatorType) => {
    const user = new User({ ...validUser, [field]: value });

    await expect(user.validate()).rejects.toMatchObject({
      errors: { [field]: { properties: { type: validatorType } } },
    });
  });

  it('should accept usernames containing only lowercase letters, numbers, _, -, and .', async () => {
    const user = new User(validUser);

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it('should lowercase usernames before validation', async () => {
    const user = new User({ ...validUser, username: 'John' });

    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.username).toBe('john');
  });

  it.each(['john doe', 'john!'])('should reject invalid username "%s"', async (username) => {
    const user = new User({ ...validUser, username });

    await expect(user.validate()).rejects.toMatchObject({
      errors: { username: expect.any(Object) },
    });
  });

  it.each(['admin', 'support', 'root', 'api', 'help', 'security', 'noreply', 'postmaster'])(
    'should reject reserved username "%s"',
    async (username) => {
      const user = new User({ ...validUser, username });

      await expect(user.validate()).rejects.toMatchObject({
        errors: { username: { message: `${username} is not allowed` } },
      });
    }
  );

  it('should hash the password before saving', async () => {
    // 1. Create and save the user
    const user = new User(validUser);
    await user.save();

    // 2. Fetch the user from the DB (bypassing the "select: false" on password)
    const savedUser = await User.findOne({ email: validUser.email }).select('+password');

    // 3. Assertions
    expect(savedUser.password).not.toBe(validUser.password); // Should not be plain text
    expect(savedUser.password.startsWith('$2a$') || savedUser.password.startsWith('$2b$')).toBe(
      true
    ); // Is a bcrypt hash

    // 4. Verify the hash actually matches the original password
    const isMatch = await bcrypt.compare(validUser.password, savedUser.password);
    expect(isMatch).toBe(true);
  });

  it('should not re-hash the password if it has not been modified', async () => {
    // 1. Create and save the user
    const user = new User(validUser);
    await user.save();
    const originalHash = user.password;

    // 2. Modify a non-password field and save again
    user.name = 'Jane Doe';
    await user.save();

    // 3. Assertions
    expect(user.password).toBe(originalHash); // Password hash should remain identical
  });
});
