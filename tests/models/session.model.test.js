import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Session from '../../src/models/session.model.js';

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
  await Session.deleteMany({});
});

describe('Session Model', () => {
  it('should successfully create a valid session', async () => {
    const session = await Session.create({
      user: new mongoose.Types.ObjectId(),
      refreshTokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 86400000),
    });

    expect(session._id).toBeDefined();
    expect(session.isRevoked).toBe(false); // Default value
    expect(session.createdAt).toBeDefined();
  });

  it('should fail if required fields are missing', async () => {
    let err;
    try {
      await new Session({}).save();
    } catch (error) {
      err = error;
    }
    expect(err).toBeDefined();
    expect(err.errors.user).toBeDefined();
    expect(err.errors.refreshTokenHash).toBeDefined();
    expect(err.errors.expiresAt).toBeDefined();
  });

  it('should have a TTL index configured on expiresAt', () => {
    const indexes = Session.schema.indexes();
    const ttlIndex = indexes.find(
      (index) => index[0].expiresAt === 1 && index[1].expireAfterSeconds === 0
    );
    expect(ttlIndex).toBeDefined();
  });
});
