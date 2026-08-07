const express = require('express');
const router = express.Router();
const { extractTenant } = require('../../middleware/tenantAuth');
const { enforceSubscriptionForWrite } = require('../../middleware/validateSubscription');
const { authenticate } = require('../../middleware/auth');
const { getAvailableSlots } = require('../../controllers/public/availabilityController');
const { createReservation } = require('../../controllers/public/bookingController');
const { getCustomerReservations } = require('../../controllers/public/customerController');
const { getCafeBySlug } = require('../../controllers/admin/cafeController');

// Cafe profile lookup by slug
router.get('/cafes/slug/:slug', getCafeBySlug);

// Customer reservation history
router.get('/customer/reservations', authenticate, getCustomerReservations);

// Available slots search (Public)
router.get('/cafes/:cafeId/available-slots', extractTenant, getAvailableSlots);

// Create reservation (Customer authenticated)
router.post(
  '/cafes/:cafeId/reservations',
  extractTenant,
  enforceSubscriptionForWrite,
  authenticate,
  createReservation
);

module.exports = router;
