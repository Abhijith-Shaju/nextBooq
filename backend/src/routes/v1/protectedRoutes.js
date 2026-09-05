const express = require('express');
const router = express.Router();
const config = require('../../config/env');
const { authenticate } = require('../../middleware/auth');
const { extractTenant } = require('../../middleware/tenantAuth');
const { requirePermission } = require('../../middleware/rbac');
const { enforceSubscriptionForWrite } = require('../../middleware/validateSubscription');
const { paymentsSettingsRateLimiter } = require('../../middleware/rateLimiter');

// Same NODE_ENV=test noop swap used in publicRoutes.js and
// cafeApplicationRoutes.js: the payments suites legitimately save
// credentials several times per run, and the limiter itself is verified
// directly in publicRouteRateLimiting.test.js.
const noop = (req, res, next) => next();
const paymentsSettingsLimiterMiddleware =
  config.NODE_ENV === 'test' ? noop : paymentsSettingsRateLimiter;

const {
  getDailyManifest,
  updateReservationStatus,
  assignTable,
  getRefundsOwed,
  getRefundsSettled,
  markRefundSettled,
} = require('../../controllers/host/reservationController');
const {
  getTables,
  createTable,
  updateTable,
} = require('../../controllers/admin/tableController');
const { updateCafe, updateCafePayments } = require('../../controllers/admin/cafeController');

// Global Auth required for all protected routes
router.use(authenticate);

// Update Cafe Settings / Reservation Rules (edit_settings permission required)
router.put(
  '/cafes/:cafeId',
  extractTenant,
  enforceSubscriptionForWrite,
  requirePermission('edit_settings'),
  updateCafe
);

// Update Payment Credentials — deliberately separate from the settings route
// above and gated on manage_billing rather than edit_settings, so a manager
// (who holds edit_settings by default) cannot redirect the cafe's payouts.
router.put(
  '/cafes/:cafeId/payments',
  paymentsSettingsLimiterMiddleware,
  extractTenant,
  enforceSubscriptionForWrite,
  requirePermission('manage_billing'),
  updateCafePayments
);

// Host Stand Manifest (view_reservations permission required)
router.get(
  '/cafes/:cafeId/reservations',
  extractTenant,
  requirePermission('view_reservations'),
  getDailyManifest
);

// Update Reservation Status (cancel_reservations required to cancel; edit_reservations for other transitions)
router.put(
  '/cafes/:cafeId/reservations/:resId/status',
  extractTenant,
  requirePermission((req) => (req.body?.status === 'CANCELLED' ? 'cancel_reservations' : 'edit_reservations')),
  updateReservationStatus
);

// Assign an existing reservation to a specific table (host-chosen, from the floorplan)
router.put(
  '/cafes/:cafeId/reservations/:resId/table',
  extractTenant,
  requirePermission('edit_reservations'),
  assignTable
);

// Refunds the cafe owes its guests after a cancellation. Reading the queue is
// part of running the floor, so it sits with view_reservations; asserting that
// a guest has actually been paid back is a money claim, so clearing an entry
// requires manage_billing -- the same permission that guards payout details.
router.get(
  '/cafes/:cafeId/refunds-owed',
  extractTenant,
  requirePermission('view_reservations'),
  getRefundsOwed
);

// The settled history. Same permission as the owed queue -- it is the same
// facts read after the fact, and whoever answers a guest asking "was I
// refunded?" needs to be able to look it up.
router.get(
  '/cafes/:cafeId/refunds-settled',
  extractTenant,
  requirePermission('view_reservations'),
  getRefundsSettled
);

router.put(
  '/cafes/:cafeId/reservations/:resId/refund-settled',
  extractTenant,
  requirePermission('manage_billing'),
  markRefundSettled
);

// Table Inventory Management -- listing tables is read-only (the Host Stand
// dashboard loads it alongside the reservation manifest to render the
// floorplan), so it only needs view_reservations, the same as the manifest
// itself. Only the mutating routes below (create/update) require edit_tables.
router.get(
  '/cafes/:cafeId/tables',
  extractTenant,
  requirePermission('view_reservations'),
  getTables
);

router.post(
  '/cafes/:cafeId/tables',
  extractTenant,
  enforceSubscriptionForWrite,
  requirePermission('edit_tables'),
  createTable
);

router.put(
  '/cafes/:cafeId/tables/:tableId',
  extractTenant,
  enforceSubscriptionForWrite,
  requirePermission('edit_tables'),
  updateTable
);

module.exports = router;
