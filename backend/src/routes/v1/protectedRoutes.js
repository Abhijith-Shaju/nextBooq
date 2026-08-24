const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { extractTenant } = require('../../middleware/tenantAuth');
const { requirePermission } = require('../../middleware/rbac');
const { enforceSubscriptionForWrite } = require('../../middleware/validateSubscription');

const {
  getDailyManifest,
  updateReservationStatus,
  assignTable,
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

// Table Inventory Management (edit_tables permission required)
router.get(
  '/cafes/:cafeId/tables',
  extractTenant,
  requirePermission('edit_tables'),
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
