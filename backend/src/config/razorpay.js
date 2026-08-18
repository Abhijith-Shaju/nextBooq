const Razorpay = require('razorpay');

/**
 * Every Razorpay SDK client in this app is built from a specific cafe's own
 * credentials (see paymentService.js) — there is no shared platform-level
 * account anymore. This is the one place that constructs the SDK client, so
 * tests only need to mock this module instead of the `razorpay` package
 * itself everywhere it's used.
 */
const createRazorpayClient = ({ key_id, key_secret }) => new Razorpay({ key_id, key_secret });

module.exports = { createRazorpayClient };
