import mongoose from 'mongoose';

export function getHealth(req, res) {
  // mongoose readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const dbConnected = mongoose.connection.readyState === 1;

  const base = {
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    database: dbConnected ? 'connected' : 'disconnected',
  };

  // ─────────────────────────────────────────────
  // Production — minimal, monitoring-friendly
  // Load balancers only need the status field.
  // Nothing sensitive about the runtime is exposed.
  // 503 when DB is down so uptime monitors can alert.
  // ─────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    return res.status(dbConnected ? 200 : 503).json(base);
  }

  // ─────────────────────────────────────────────
  // Development — extra diagnostics
  // ─────────────────────────────────────────────
  return res.status(200).json({
    ...base,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    node: process.version,
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
    },
  });
}
