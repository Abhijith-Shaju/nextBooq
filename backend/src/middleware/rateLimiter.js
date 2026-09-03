const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { logAuditEvent } = require('../services/auditService');

// Buckets a limiter per authenticated user rather than per IP, falling back
// to the IP when the request isn't authenticated yet. Needed wherever the
// per-IP default would punish unrelated people: carrier-grade NAT is the
// norm on Indian mobile networks, so a single public IP can front a large
// number of subscribers, and production audit logs confirm real diners
// arriving on those addresses. ipKeyGenerator (rather than a bare req.ip)
// keeps the fallback IPv6-correct and satisfies the library's own key
// validation.
const userOrIpKey = (req) =>
  req.user?._id ? `user:${req.user._id}` : ipKeyGenerator(req.ip);

const createRateLimiter = ({ windowMs, max, message, keyGenerator, skipFailedRequests }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    ...(skipFailedRequests && { skipFailedRequests }),
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

// Bounds how many table HOLDs a single customer can create per hour — without
// this, a client could repeatedly create HOLD reservations to squat on table
// inventory (each HOLD blocks that slot for other customers until it expires).
//
// Keyed per user, not per IP: the bucket is global rather than per-cafe, so
// on a shared/CGNAT address two diners booking at two *different* cafes were
// previously competing for the same 10 holds an hour — a limit that gets
// tighter as the platform adds cafes rather than as any one cafe gets busy.
// This limiter therefore has to sit after `authenticate` in the route stack;
// bookingCreationIpRateLimiter below stays in front of it as the outer bound.
//
// skipFailedRequests so only holds that were actually created count. Squatting
// on inventory is the thing being bounded, and a rejected request creates no
// hold — previously a diner who mistyped a party size or picked a past date
// burned quota they never used, and could be locked out before booking once.
const bookingCreationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  skipFailedRequests: true,
  message: 'Too many booking attempts. Please try again later.',
});

// Outer, deliberately generous per-IP bound that runs before tenant lookup
// and authentication, preserving the cheap-flood protection the per-user
// limiter above can no longer provide from its later position in the stack.
// Sized so it is not reachable by legitimate use, including a shared address.
const bookingCreationIpRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 120,
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

// Saving payment credentials consumes a 6-digit step-up OTP, and that OTP is
// the only thing standing between a stolen owner session and redirecting a
// cafe's Razorpay payouts. The code space is 10^6 over a 10-minute window and
// a wrong guess neither consumes the code nor records an attempt, so without
// a limiter here the guessing is bounded only by request throughput. This was
// the one write route in the app with no limiter attached at all.
//
// Deliberately does NOT skip failed requests: failed attempts are exactly
// what needs bounding. Keyed per user because the route is already
// authenticated, so an attacker rotating IPs gains nothing.
const paymentsSettingsRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  message: 'Too many payment settings attempts. Please try again later.',
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
  bookingCreationIpRateLimiter,
  paymentsSettingsRateLimiter,
  contactFormRateLimiter,
  cafeApplicationRateLimiter,
};
