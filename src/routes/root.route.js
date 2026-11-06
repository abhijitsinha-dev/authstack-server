import { Router } from 'express';
import { getRoot } from '../controllers/root.controller.js';

const router = Router();

/**
 * @swagger
 * /:
 *   get:
 *     summary: Root health probe
 *     description: Returns a basic status response. Development mode includes extra fields.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is alive.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 api:
 *                   type: string
 *                   example: v1
 */
router.route('/').get(getRoot);

export default router;
