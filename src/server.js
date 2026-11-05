import app from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './config/logger.js';

const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// Boot sequence
// 1. Connect to MongoDB
// 2. Start listening only after DB is ready
//    (avoids serving 500s on cold start)
// ─────────────────────────────────────────────
async function start() {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      logger.info(`✅ API → http://localhost:${PORT}`);
      logger.info(`Env: ${process.env.NODE_ENV || 'development'}`);
    });

    // ─────────────────────────────────────────────
    // Graceful shutdown — close the HTTP server first
    // (drain in-flight requests), then the Mongo connection.
    // ─────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.warn(`Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        try {
          await disconnectDB();
          logger.info('Shutdown complete');
          process.exit(0);
        } catch (err) {
          logger.error('Error during shutdown', { error: err.message });
          process.exit(1);
        }
      });

      // Force exit if shutdown hangs (e.g., stuck connection)
      setTimeout(() => {
        logger.error('Shutdown timed out, forcing exit');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // ─────────────────────────────────────────────
    // Safety net — log and exit on truly unhandled errors.
    // Registered AFTER the server is running so startup
    // failures still surface via the try/catch above.
    // ─────────────────────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason: String(reason) });
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      server.close(() => process.exit(1));
    });
  } catch (err) {
    logger.error('❌ Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();
