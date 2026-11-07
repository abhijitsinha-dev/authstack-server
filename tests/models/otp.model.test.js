import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Otp from '../../src/models/otp.model.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Otp.deleteMany({});
});

describe('Otp Model', () => {
  const validOtp = {
    email: 'john@example.com',
    codeHash: 'hashed-otp-string',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins from now
  };

  it('should successfully create and save a valid OTP', async () => {
    const otp = new Otp(validOtp);
    const savedOtp = await otp.save();

    expect(savedOtp._id).toBeDefined();
    expect(savedOtp.email).toBe(validOtp.email);
    expect(savedOtp.codeHash).toBe(validOtp.codeHash);
    expect(savedOtp.createdAt).toBeDefined(); // From timestamps: true
  });

  it('should fail validation if required fields are missing', async () => {
    const otp = new Otp({});

    let err;
    try {
      await otp.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeDefined();
    expect(err.errors.email).toBeDefined();
    expect(err.errors.codeHash).toBeDefined();
    expect(err.errors.expiresAt).toBeDefined();
  });

  it('should lowercase and trim the email automatically', async () => {
    const otp = new Otp({
      ...validOtp,
      email: '  JOHN@EXAMPLE.COM  ',
    });
    const savedOtp = await otp.save();

    expect(savedOtp.email).toBe('john@example.com');
  });

  it('should have a TTL index configured on the expiresAt field', () => {
    // Access the underlying schema indexes to verify TTL setup
    const indexes = Otp.schema.indexes();

    // Look for the index on expiresAt with expireAfterSeconds: 0
    const ttlIndex = indexes.find(
      (index) => index[0].expiresAt === 1 && index[1].expireAfterSeconds === 0
    );

    expect(ttlIndex).toBeDefined();
  });
});
