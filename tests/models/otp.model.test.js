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

  // ─────────────────────────────────────────────
  // Purpose enum — all three values must be accepted
  // ─────────────────────────────────────────────
  it.each([
    { purpose: 'signup', description: 'signup' },
    { purpose: 'reset', description: 'reset' },
    { purpose: 'email-change', description: 'email-change' },
  ])('should accept purpose "$description"', async ({ purpose }) => {
    const otp = new Otp({ ...validOtp, purpose });
    const savedOtp = await otp.save();
    expect(savedOtp.purpose).toBe(purpose);
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

  // ─────────────────────────────────────────────
  // userId field (added for email-change OTPs)
  //
  // Email-change OTPs are scoped to a specific user (via userId) so that:
  //   - Two users requesting the same newEmail don't collide
  //   - A stale OTP for a previous target address can be safely superseded
  //
  // The field is optional: signup and reset OTPs don't set it.
  // ─────────────────────────────────────────────
  it('should leave userId undefined for signup and reset OTPs', async () => {
    const signupOtp = await Otp.create({ ...validOtp, purpose: 'signup' });
    const resetOtp = await Otp.create({ ...validOtp, purpose: 'reset' });

    expect(signupOtp.userId).toBeUndefined();
    expect(resetOtp.userId).toBeUndefined();
  });

  it('should persist userId when provided (email-change flow)', async () => {
    const userId = new mongoose.Types.ObjectId();

    const otp = await Otp.create({
      userId,
      email: 'new-address@example.com',
      codeHash: 'hashed',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: 'email-change',
    });

    const fetched = await Otp.findById(otp._id);

    expect(fetched.userId).toBeDefined();
    expect(fetched.userId.toString()).toBe(userId.toString());
  });

  it('should support querying OTPs by userId and purpose (email-change lookup)', async () => {
    const userIdA = new mongoose.Types.ObjectId();
    const userIdB = new mongoose.Types.ObjectId();

    // Two different users requesting the same new email
    await Otp.create({
      userId: userIdA,
      email: 'new@example.com',
      codeHash: 'hash-a',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: 'email-change',
    });
    await Otp.create({
      userId: userIdB,
      email: 'new@example.com',
      codeHash: 'hash-b',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: 'email-change',
    });

    // Querying by userId + purpose must return only one
    const recordA = await Otp.findOne({ userId: userIdA, purpose: 'email-change' });
    const recordB = await Otp.findOne({ userId: userIdB, purpose: 'email-change' });

    expect(recordA.codeHash).toBe('hash-a');
    expect(recordB.codeHash).toBe('hash-b');
  });

  it('should have an index on userId for efficient email-change lookups', () => {
    const indexes = Otp.schema.indexes();
    // Mongoose auto-creates an index on fields with `index: true`
    const userIdIndex = indexes.find((index) => index[0].userId === 1);

    expect(userIdIndex).toBeDefined();
  });
});
