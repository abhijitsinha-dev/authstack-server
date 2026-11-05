import { Router } from 'express';
import { getRoot } from '../controllers/root.controller.js';

const router = Router();

router.route('/').get(getRoot);

export default router;
