import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

router.route('/').get(getHealth);

export default router;
