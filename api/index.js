import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';

export default async function handler(req, res) {
  try {
    await connectDB();
  } catch {
    // connectDB() already logged the underlying error via Winston,
    // so we don't re-log here.
    //
    // Respond 503 (transient / retryable) instead of letting the rejection
    // bubble up and Vercel emit a generic 500 (which signals "our code is
    // broken" and doesn't hint that retrying might help).
    //
    // Use raw Node APIs: Express's res.status()/res.json() aren't attached
    // until app(req, res) is called — and we're deliberately not calling it.
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', '30');
    res.end(
      JSON.stringify({
        success: false,
        message: 'Service temporarily unavailable. Please retry shortly.',
      })
    );
    return;
  }

  return app(req, res);
}
