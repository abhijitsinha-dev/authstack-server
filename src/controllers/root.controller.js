export function getRoot(_req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.json({
      status: 'ok',
      api: 'v1',
    });
  }

  res.json({
    status: 'ok',
    service: 'authstack',
    environment: process.env.NODE_ENV || 'development',
    api: 'v1',
    health: '/health',
  });
}
