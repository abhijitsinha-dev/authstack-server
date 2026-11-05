import { Router } from 'express';
import { notFoundHandler } from '../controllers/notFound.controller.js';

const router = Router();

// Express 5 catch-all: matches /, /foo, /foo/bar/baz — anything unmatched.
// The `{*splat}` syntax makes the wildcard optional so `/` is also caught.
router.route('/{*splat}').all(notFoundHandler);

export default router;
