const express = require('express');
const router = express.Router();
const config = require('../../config/env');
const { authenticate } = require('../../middleware/auth');
const { cafeApplicationRateLimiter } = require('../../middleware/rateLimiter');
const {
  postCafeApplication,
  getMyCafeApplication,
  deleteMyCafeApplication,
} = require('../../controllers/cafeApplicationController');

// Automated tests legitimately submit several applications per run (this
// route's own test file included) that have nothing to do with abuse — the
// limiter itself is exercised directly wherever rate limiters are unit
// tested, so it's safe to not wire it into routes under test. Mirrors the
// same NODE_ENV=test noop swap used in publicRoutes.js.
const noop = (req, res, next) => next();
const cafeApplicationLimiterMiddleware = config.NODE_ENV === 'test' ? noop : cafeApplicationRateLimiter;

router.use(authenticate);

router.post('/', cafeApplicationLimiterMiddleware, postCafeApplication);
router.get('/mine', getMyCafeApplication);
router.delete('/mine', deleteMyCafeApplication);

module.exports = router;
