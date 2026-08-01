const express = require('express');
const router = express.Router();

const authRoutes = require('./v1/authRoutes');
const publicRoutes = require('./v1/publicRoutes');
const protectedRoutes = require('./v1/protectedRoutes');
const webhookRoutes = require('./v1/webhookRoutes');

router.use('/v1/auth', authRoutes);
router.use('/v1/webhooks', webhookRoutes);
router.use('/v1', publicRoutes);
router.use('/v1', protectedRoutes);

module.exports = router;
