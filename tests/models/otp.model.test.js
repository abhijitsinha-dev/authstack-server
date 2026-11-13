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
    purpose: 'signup',
  };

  it('should successfully create and save a valid OTP', async () => {
    const otp = new Otp(validOtp);
    const savedOtp = await otp.save();

    expect(savedOtp._id).toBeDefined();
    expect(savedOtp.email).toBe(validOtp.email);
    expect(savedOtp.codeHash).toBe(validOtp.codeHash);
    expect(savedOtp.createdAt).toBeDefined();
    expect(savedOtp.attempts).toBe(0);
    expect(savedOtp.purpose).toBe('signup');
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
    expect(err.errors.purpose).toBeDefined();
  });

  it('should reject an invalid purpose value', async () => {
    const otp = new Otp({
      ...validOtp,
      purpose: 'invalid-purpose',
    });

    let err;
    try {
      await otp.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeDefined();
    expect(err.errors.purpose).toBeDefined();
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
    const indexes = Otp.schema.indexes();
    const ttlIndex = indexes.find(
      (index) => index[0].expiresAt === 1 && index[1].expireAfterSeconds === 0
    );

    expect(ttlIndex).toBeDefined();
  });

  it('should have a compound index on email and purpose', () => {
    const indexes = Otp.schema.indexes();
    const compoundIndex = indexes.find((index) => index[0].email === 1 && index[0].purpose === 1);

    expect(compoundIndex).toBeDefined();
  });
});
