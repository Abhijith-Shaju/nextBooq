const express = require('express');
const router = express.Router();
const { handleRazorpayWebhook } = require('../../controllers/webhookController');

router.post('/webhooks/razorpay', handleRazorpayWebhook);

module.exports = router;
