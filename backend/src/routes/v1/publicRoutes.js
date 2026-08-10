const express = require('express');
const router = express.Router();
const config = require('../../config/env');
const { extractTenant } = require('../../middleware/tenantAuth');
const { enforceSubscriptionForWrite } = require('../../middleware/validateSubscription');
const { authenticate } = require('../../middleware/auth');
const { availabilityRateLimiter, bookingCreationRateLimiter } = require('../../middleware/rateLimiter');
const { getAvailableSlots } = require('../../controllers/public/availabilityController');
const { createReservation, verifyPayment } = require('../../controllers/public/bookingController');
const { getCustomerReservations } = require('../../controllers/public/customerController');
const { getCafeBySlug } = require('../../controllers/admin/cafeController');

// Automated tests legitimately fire many booking/availability requests per run
// (concurrency/race-condition suites especially) that have nothing to do with
// abuse — the rate limiters themselves are unit-tested directly against a
// dedicated app in publicRouteRateLimiting.test.js, so it's safe to not wire
// them into routes under test.
const noop = (req, res, next) => next();
const availabilityLimiterMiddleware = config.NODE_ENV === 'test' ? noop : availabilityRateLimiter;
const bookingCreationLimiterMiddleware = config.NODE_ENV === 'test' ? noop : bookingCreationRateLimiter;

// Cafe profile lookup by slug
router.get('/cafes/slug/:slug', getCafeBySlug);

// Customer reservation history
router.get('/customer/reservations', authenticate, getCustomerReservations);

// Available slots search (Public)
router.get('/cafes/:cafeId/available-slots', availabilityLimiterMiddleware, extractTenant, getAvailableSlots);

// Create reservation (Customer authenticated)
router.post(
  '/cafes/:cafeId/reservations',
  bookingCreationLimiterMiddleware,
  extractTenant,
  enforceSubscriptionForWrite,
  authenticate,
  createReservation
);

// Verify a client-side Razorpay Checkout payment and confirm the reservation
router.post(
  '/cafes/:cafeId/reservations/:reservationId/verify-payment',
  extractTenant,
  authenticate,
  verifyPayment
);

module.exports = router;
