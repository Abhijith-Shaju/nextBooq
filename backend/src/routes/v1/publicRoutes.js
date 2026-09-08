const express = require('express');
const router = express.Router();
const config = require('../../config/env');
const { extractTenant } = require('../../middleware/tenantAuth');
const { enforceSubscriptionForWrite } = require('../../middleware/validateSubscription');
const { authenticate } = require('../../middleware/auth');
const {
  availabilityRateLimiter,
  bookingCreationRateLimiter,
  bookingCreationIpRateLimiter,
  contactFormRateLimiter,
} = require('../../middleware/rateLimiter');
const { getAvailableSlots } = require('../../controllers/public/availabilityController');
const { createReservation, verifyPayment } = require('../../controllers/public/bookingController');
const {
  getCustomerReservations,
  cancelCustomerReservation,
} = require('../../controllers/public/customerController');
const { getCafeBySlug } = require('../../controllers/admin/cafeController');
const { submitContactForm } = require('../../controllers/public/contactController');

// Automated tests legitimately fire many booking/availability requests per run
// (concurrency/race-condition suites especially) that have nothing to do with
// abuse — the rate limiters themselves are unit-tested directly against a
// dedicated app in publicRouteRateLimiting.test.js, so it's safe to not wire
// them into routes under test.
const noop = (req, res, next) => next();
const availabilityLimiterMiddleware = config.NODE_ENV === 'test' ? noop : availabilityRateLimiter;
const bookingCreationLimiterMiddleware = config.NODE_ENV === 'test' ? noop : bookingCreationRateLimiter;
const bookingCreationIpLimiterMiddleware = config.NODE_ENV === 'test' ? noop : bookingCreationIpRateLimiter;
const contactFormLimiterMiddleware = config.NODE_ENV === 'test' ? noop : contactFormRateLimiter;

// Cafe profile lookup by slug
router.get('/cafes/slug/:slug', getCafeBySlug);

// Contact Us form submission (Public, unauthenticated)
router.post('/contact', contactFormLimiterMiddleware, submitContactForm);

// Customer reservation history
router.get('/customer/reservations', authenticate, getCustomerReservations);

// Guest cancels their own booking. Scoped to the customer rather than to a
// cafe: the reservation is found by id and owner together, so there is no
// tenant to resolve and no way to reach someone else's booking.
router.post(
  '/customer/reservations/:reservationId/cancel',
  authenticate,
  cancelCustomerReservation
);

// Available slots search (Public)
router.get('/cafes/:cafeId/available-slots', availabilityLimiterMiddleware, extractTenant, getAvailableSlots);

// Create reservation (Customer authenticated)
//
// bookingCreationLimiterMiddleware is keyed per user, so it must run *after*
// authenticate has populated req.user — otherwise every request falls back to
// the IP key and shared/CGNAT addresses share one bucket (see rateLimiter.js).
// The IP limiter stays in front as the outer bound on unauthenticated floods.
router.post(
  '/cafes/:cafeId/reservations',
  bookingCreationIpLimiterMiddleware,
  extractTenant,
  enforceSubscriptionForWrite,
  authenticate,
  bookingCreationLimiterMiddleware,
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
