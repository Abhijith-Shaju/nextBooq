const crypto = require('crypto');
const Cafe = require('../models/Cafe');
const Reservation = require('../models/Reservation');
const { transitionState } = require('../services/stateMachine');
const { decrypt } = require('../utils/encryption');

const handleRazorpayWebhook = async (req, res, next) => {
  try {
    const { cafeSlug } = req.params;
    const cafe = await Cafe.findOne({ slug: cafeSlug, is_deleted: false });
    if (!cafe || !cafe.payments?.configured) {
      return res.status(404).json({ status: 'fail', message: 'Unknown cafe' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const secret = decrypt(cafe.payments.razorpay_webhook_secret_encrypted);

    if (!signature) {
      return res.status(400).json({ status: 'fail', message: 'Missing Razorpay signature' });
    }

    // Verify HMAC-SHA256 signature over the exact bytes Razorpay signed.
    // req.rawBody is populated by the express.json() `verify` hook in app.js;
    // re-serializing req.body via JSON.stringify is not guaranteed to match
    // the original bytes (key order, whitespace) and would make legitimate
    // webhooks fail verification.
    if (!req.rawBody) {
      return res.status(400).json({ status: 'fail', message: 'Missing raw request body' });
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const signatureValid =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!signatureValid) {
      console.warn('[WEBHOOK BAD SIG] Webhook signature verification failed');
      return res.status(400).json({ status: 'fail', message: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    if (!payload || !payload.payment || !payload.payment.entity) {
      return res.status(200).json({ status: 'ok', message: 'Ignored irrelevant payload format' });
    }

    const paymentEntity = payload.payment.entity;
    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;

    const reservation = await Reservation.findOne({ 'payment_data.order_id': orderId });
    if (!reservation) {
      console.warn(`[WEBHOOK NO RES] No reservation found matching orderId: ${orderId}`);
      return res.status(200).json({ status: 'ok', message: 'Order not associated with reservation' });
    }

    // Idempotency check
    if (reservation.payment_data && reservation.payment_data.webhook_processed) {
      console.log(`[WEBHOOK IDEMPOTENT] Webhook for orderId ${orderId} already processed.`);
      return res.status(200).json({ status: 'ok', message: 'Webhook already processed' });
    }

    const currentStatus = reservation.status;

    if (event === 'payment.captured' || event === 'order.paid') {
      if (currentStatus === 'PENDING_PAYMENT') {
        // Transition PENDING_PAYMENT -> CONFIRMED
        await transitionState({
          reservationId: reservation._id,
          tenantId: reservation.cafe_id,
          targetStatus: 'CONFIRMED',
          expectedVersion: reservation.__v,
          paymentDataUpdates: {
            payment_id: paymentId,
            status: 'SUCCESS',
            webhook_processed: true,
          },
        });
        console.log(`✅ [WEBHOOK SUCCESS] Reservation ${reservation._id} CONFIRMED.`);
      } else if (['CANCELLED', 'EXPIRED', 'COMPLETED'].includes(currentStatus)) {
        // Terminal state race condition mitigation: Flag for manual refund
        await Reservation.updateOne(
          { _id: reservation._id },
          {
            $set: {
              'payment_data.webhook_processed': true,
              'payment_data.requires_manual_refund': true,
              'payment_data.payment_id': paymentId,
              'payment_data.status': 'SUCCESS_LATE',
            },
          }
        );
        console.warn(
          `⚠️ [WEBHOOK LATE REFUND ALERT] Payment succeeded for reservation ${reservation._id} currently in ${currentStatus} state. Flagged for manual refund.`
        );
      }
    } else if (event === 'payment.failed') {
      if (currentStatus === 'PENDING_PAYMENT' || currentStatus === 'HOLD') {
        // Transition to CANCELLED to release table inventory
        await transitionState({
          reservationId: reservation._id,
          tenantId: reservation.cafe_id,
          targetStatus: 'CANCELLED',
          expectedVersion: reservation.__v,
          paymentDataUpdates: {
            payment_id: paymentId,
            status: 'FAILED',
            webhook_processed: true,
          },
        });
        console.log(`ℹ️ [WEBHOOK FAILED] Reservation ${reservation._id} CANCELLED due to payment failure.`);
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[WEBHOOK ERROR]', error);
    next(error);
  }
};

module.exports = {
  handleRazorpayWebhook,
};
