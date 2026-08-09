const rateLimit = require('express-rate-limit');
const { logAuditEvent } = require('../services/auditService');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logAuditEvent({
      cafeId: null,
      entityType: 'RateLimit',
      entityId: null,
      action: 'RATE_LIMIT_BLOCKED',
      afterState: { path: req.originalUrl, ip: req.ip },
      performedByUserId: null,
    });
    res.status(options.statusCode).json(options.message);
  },
  message: {
    status: 'fail',
    statusCode: 429,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

module.exports = { authRateLimiter };
