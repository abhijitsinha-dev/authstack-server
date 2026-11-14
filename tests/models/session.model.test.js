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
  const validSession = () => ({
    user: new mongoose.Types.ObjectId(),
    refreshTokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 86400000),
  });

  it('should successfully create a valid session', async () => {
    const session = await Session.create(validSession());

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

  // ─────────────────────────────────────────────
  // revokedAt field (added in the password-reset PR)
  //
  // Session revocation is written by:
  //   - logoutUser (single session)
  //   - resetPassword (all sessions for the user)
  //
  // The field is optional (no default), so we assert its lifecycle:
  // undefined on a fresh session → set when revoked → persisted as a Date.
  // ─────────────────────────────────────────────
  it('should leave revokedAt undefined on a freshly created session', async () => {
    const session = await Session.create(validSession());

    expect(session.revokedAt).toBeUndefined();
    expect(session.isRevoked).toBe(false);
  });

  it('should persist revokedAt when a session is revoked', async () => {
    const revokedAt = new Date();
    const session = await Session.create({
      ...validSession(),
      isRevoked: true,
      revokedAt,
    });

    // Re-fetch to prove it was actually persisted, not just held in memory
    const fetched = await Session.findById(session._id);

    expect(fetched.isRevoked).toBe(true);
    expect(fetched.revokedAt).toBeInstanceOf(Date);
    expect(fetched.revokedAt.toISOString()).toBe(revokedAt.toISOString());
  });

  it('should allow updating isRevoked and revokedAt atomically (revocation flow)', async () => {
    // Mirrors what logoutUser and resetPassword actually do
    const session = await Session.create(validSession());
    const revokedAt = new Date();

    const updated = await Session.findByIdAndUpdate(
      session._id,
      { isRevoked: true, revokedAt },
      { returnDocument: 'after' }
    );

    expect(updated.isRevoked).toBe(true);
    expect(updated.revokedAt).toBeInstanceOf(Date);
    expect(updated.revokedAt.toISOString()).toBe(revokedAt.toISOString());
  });

  it('should revoke all sessions for a user via updateMany (reset-password flow)', async () => {
    const userId = new mongoose.Types.ObjectId();

    // Create 3 active sessions for the same user
    await Promise.all([
      Session.create({ ...validSession(), user: userId }),
      Session.create({ ...validSession(), user: userId }),
      Session.create({ ...validSession(), user: userId }),
    ]);

    // Simulate what resetPassword does
    const revokedAt = new Date();
    await Session.updateMany({ user: userId }, { isRevoked: true, revokedAt });

    const active = await Session.countDocuments({ user: userId, isRevoked: false });
    const revoked = await Session.countDocuments({
      user: userId,
      isRevoked: true,
      revokedAt: { $exists: true },
    });

    expect(active).toBe(0);
    expect(revoked).toBe(3);
  });

  // ─────────────────────────────────────────────
  // lastUsedAt field
  //
  // Set on creation via the schema default (Date.now function reference).
  // Updated on every successful /refresh by refreshTokens().
  // Used by the sessions UI ("Active 5 min ago") and dormant-session cleanup.
  // ─────────────────────────────────────────────
  it('should default lastUsedAt to the current time on creation', async () => {
    const before = Date.now();
    const session = await Session.create(validSession());
    const after = Date.now();

    expect(session.lastUsedAt).toBeInstanceOf(Date);
    expect(session.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(session.lastUsedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
