const rateLimit = require('express-rate-limit');
const { logAuditEvent } = require('../services/auditService');

const createRateLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res, next, options) => {
      if (req.rateLimit.used === req.rateLimit.limit + 1) {
        await logAuditEvent({
          cafeId: null,
          entityType: 'RateLimit',
          entityId: null,
          action: 'RATE_LIMIT_BLOCKED',
          afterState: { path: req.originalUrl, ip: req.ip },
          performedByUserId: null,
        });
      }
      res.status(options.statusCode).json(options.message);
    },
    message: {
      status: 'fail',
      statusCode: 429,
      message,
    },
  });

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please try again later.',
});

// The availability search runs the table-allocation backtracking algorithm
// per candidate slot and is unauthenticated, making it a cheap CPU-amplification
// DoS vector without a limiter.
const availabilityRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many availability requests. Please try again shortly.',
});

// Bounds how many table HOLDs a single client can create per hour — without
// this, a client could repeatedly create HOLD reservations to squat on table
// inventory (each HOLD blocks that slot for other customers until it expires).
const bookingCreationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many booking attempts. Please try again later.',
});

// Unauthenticated POST that triggers an outbound email on every request —
// without a limiter, this is a cheap way to spam the configured recipient's
// inbox (and burn Resend send quota) from a single IP.
const contactFormRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many contact form submissions. Please try again later.',
});

// Its own bucket rather than sharing contactFormRateLimiter's: submitting an
// application emails the operator, so someone hammering one form must not be
// able to exhaust the other's quota.
const cafeApplicationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many cafe applications from this IP, please try again later.',
});

module.exports = {
  authRateLimiter,
  availabilityRateLimiter,
  bookingCreationRateLimiter,
  contactFormRateLimiter,
  cafeApplicationRateLimiter,
};
