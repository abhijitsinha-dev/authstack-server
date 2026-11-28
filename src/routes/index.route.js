import { Router } from 'express';
import authRoute from './auth.route.js';
import usersRoute from './users.route.js';

const router = Router();

router.use('/auth', authRoute);
router.use('/users', usersRoute);

export default router;
