const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requirePlatformAdmin } = require('../../middleware/requirePlatformAdmin');
const {
  getOverview,
  getOrgs,
  getRefundsNeeded,
  getCafeSubscriptions,
  postCafeSubscription,
  patchCafeSubscriptionStatus,
  getOwnerLookup,
  postProvisionCafe,
  getCafeApplications,
  getCafeApplication,
  postApproveCafeApplication,
  postRejectCafeApplication,
} = require('../../controllers/platformAdmin/platformAdminController');

router.use(authenticate, requirePlatformAdmin);

router.get('/overview', getOverview);
router.get('/orgs', getOrgs);
router.get('/refunds-needed', getRefundsNeeded);
router.get('/users/lookup', getOwnerLookup);
router.post('/cafes', postProvisionCafe);
router.get('/cafes/:cafeId/subscriptions', getCafeSubscriptions);
router.post('/cafes/:cafeId/subscriptions', postCafeSubscription);
router.patch('/cafes/:cafeId/subscriptions/status', patchCafeSubscriptionStatus);
router.get('/cafe-applications', getCafeApplications);
router.get('/cafe-applications/:id', getCafeApplication);
router.post('/cafe-applications/:id/approve', postApproveCafeApplication);
router.post('/cafe-applications/:id/reject', postRejectCafeApplication);

module.exports = router;
