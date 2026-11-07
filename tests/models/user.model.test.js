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
    name: 'John Doe',
    email: 'john@example.com',
    password: 'Password123',
  };

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
