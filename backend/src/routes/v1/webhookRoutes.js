const express = require('express');
const router = express.Router();
const { handleRazorpayWebhook } = require('../../controllers/webhookController');

router.post('/razorpay/:cafeSlug', handleRazorpayWebhook);

module.exports = router;
