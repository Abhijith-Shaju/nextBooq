const express = require('express');
const router = express.Router();

const authRoutes = require('./v1/authRoutes');
const publicRoutes = require('./v1/publicRoutes');
const protectedRoutes = require('./v1/protectedRoutes');
const webhookRoutes = require('./v1/webhookRoutes');
const platformAdminRoutes = require('./v1/platformAdminRoutes');
const orgRoutes = require('./v1/orgRoutes');
const cafeApplicationRoutes = require('./v1/cafeApplicationRoutes');

router.use('/v1/auth', authRoutes);
router.use('/v1/webhooks', webhookRoutes);
router.use('/v1', publicRoutes);
router.use('/v1', protectedRoutes);
router.use('/v1/platform-admin', platformAdminRoutes);
router.use('/v1/org', orgRoutes);
router.use('/v1/cafe-applications', cafeApplicationRoutes);

module.exports = router;
