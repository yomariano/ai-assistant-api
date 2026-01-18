const express = require('express');
const demoRateLimit = require('../services/demoRateLimit');

const router = express.Router();

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    // XFF can be a comma-separated list. Client IP is usually first.
    return xff.split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  // Express fallback
  return req.ip || '';
}

/**
 * POST /api/public/live-demo/allow
 * Simple per-IP allowance for the marketing live demo.
 *
 * Response:
 *  - { allowed: true, remaining: number, resetAt: ISOString }
 *  - { allowed: false, remaining: 0, resetAt: ISOString }
 */
router.post('/allow', (req, res) => {
  const ip = getClientIp(req);
  const result = demoRateLimit.consume(ip);
  return res.json(result);
});

module.exports = router;

