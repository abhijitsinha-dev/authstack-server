import mongoose from 'mongoose';
import { attachDatabasePool } from '@vercel/functions';
import { logger } from './logger.js';

// ─────────────────────────────────────────────
// Global connection cache
// Vercel reuses warm function instances. Caching on `global` means
// subsequent invocations reuse the same Mongo connection instead of
// opening a new one per request (which exhausts the Atlas connection limit).
// ─────────────────────────────────────────────
let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

// Fail fast instead of silently queuing queries before a connection exists
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

// ─────────────────────────────────────────────
// connectDB — called from api/index.js and src/server.js
// ─────────────────────────────────────────────
export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const options = {
      maxPoolSize: 5, // small pool per lambda; Atlas scales via instances
      minPoolSize: 0, // allow pool to drain while the function is suspended
      serverSelectionTimeoutMS: 5000, // match Vercel function timeout headroom
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      dbName: 'authstack',
    };

    cached.promise = mongoose.connect(process.env.MONGODB_URI, options).then((instance) => {
      // Hand the underlying MongoClient to Vercel so idle connections
      // are properly closed when the function suspends.
      attachDatabasePool(instance.connection.client);

      logger.info('MongoDB connected', {
        host: instance.connection.host,
        database: instance.connection.name,
      });

      // Lifecycle events — visible in Vercel logs
      mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
      mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
      mongoose.connection.on('error', (err) =>
        logger.error('MongoDB connection error', { error: err.message })
      );

      return instance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next invocation can retry (e.g., transient Atlas hiccup)
    cached.promise = null;
    logger.error('MongoDB connection failed', { error: err.message, stack: err.stack });
    throw err;
  }

  return cached.conn;
}

// ─────────────────────────────────────────────
// disconnectDB — optional; used by local graceful shutdown only
// ─────────────────────────────────────────────
export async function disconnectDB() {
  if (!cached.conn) return;

  await mongoose.disconnect();
  cached.conn = null;
  cached.promise = null;
  logger.info('MongoDB connection closed');
}
