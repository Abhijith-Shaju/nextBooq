const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { requirePlatformAdmin } = require('../../middleware/requirePlatformAdmin');
const {
  getOverview,
  getOrgs,
  getCafeSubscriptions,
  postCafeSubscription,
  patchCafeSubscriptionStatus,
} = require('../../controllers/platformAdmin/platformAdminController');

router.use(authenticate, requirePlatformAdmin);

router.get('/overview', getOverview);
router.get('/orgs', getOrgs);
router.get('/cafes/:cafeId/subscriptions', getCafeSubscriptions);
router.post('/cafes/:cafeId/subscriptions', postCafeSubscription);
router.patch('/cafes/:cafeId/subscriptions/status', patchCafeSubscriptionStatus);

module.exports = router;
