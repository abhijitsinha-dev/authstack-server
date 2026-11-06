import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Detailed health check
 *     description: Returns API status and database connectivity. Returns 503 if the database is disconnected.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy and database is connected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: integer
 *                   example: 3600
 *                 database:
 *                   type: string
 *                   example: connected
 *       503:
 *         description: API is running but database is disconnected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: degraded
 *                 database:
 *                   type: string
 *                   example: disconnected
 */
router.route('/').get(getHealth);

export default router;
