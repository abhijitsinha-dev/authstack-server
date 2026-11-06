import { Router } from 'express';
import rootRoute from './root.route.js';
import healthRoute from './health.route.js';
import notFoundRoute from './notFound.route.js';

const router = Router();

router.use('/', rootRoute);
router.use('/health', healthRoute);
router.use(notFoundRoute); // catch-all — must be last

export default router;
