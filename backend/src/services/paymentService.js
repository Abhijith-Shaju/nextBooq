const crypto = require('crypto');
const { createRazorpayClient } = require('../config/razorpay');
const { decrypt } = require('../utils/encryption');
const Reservation = require('../models/Reservation');
const Cafe = require('../models/Cafe');
const { transitionState } = require('./stateMachine');
const { BadRequestError } = require('../utils/errors');
const config = require('../config/env');

const getRazorpayClientForCafe = (cafe) => {
  const keySecret = decrypt(cafe.payments.razorpay_key_secret_encrypted);
  return createRazorpayClient({ key_id: cafe.payments.razorpay_key_id, key_secret: keySecret });
};

/**
 * Creates a Razorpay Order and transitions reservation HOLD -> PENDING_PAYMENT.
 */
const createOrderForReservation = async (reservationId, tenantId, amountInRupees) => {
  const reservation = await Reservation.findOne({ _id: reservationId, cafe_id: tenantId });
  if (!reservation) {
    throw new BadRequestError('Reservation not found');
  }

  const cafe = await Cafe.findById(tenantId);
  const paymentTimeoutMinutes = cafe?.reservation_rules?.payment_timeout_minutes || 15;

  if (!cafe?.payments?.configured && config.NODE_ENV !== 'development') {
    throw new BadRequestError("This cafe hasn't finished setting up payments yet.");
  }

  if (reservation.status !== 'HOLD') {
    throw new BadRequestError(`Cannot create payment order for reservation in state ${reservation.status}`);
  }

  const amountInPaise = Math.round(amountInRupees * 100);

  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: `res_${reservation._id.toString().slice(-8)}_${Date.now().toString().slice(-6)}`,
    notes: {
      reservation_id: reservation._id.toString(),
      cafe_id: tenantId.toString(),
    },
  };

  let order;
  try {
    const client = cafe.payments?.configured ? getRazorpayClientForCafe(cafe) : null;
    if (!client) {
      // Only reachable in development for an unconfigured cafe (guarded above
      // for all other environments) — fall through to the existing mock path.
      throw new Error('No Razorpay client configured for this cafe (development mock fallback)');
    }
    order = await client.orders.create(options);
  } catch (razorpayErr) {
    const isAuthFail =
      razorpayErr?.statusCode === 401 ||
      razorpayErr?.error?.code === 'BAD_REQUEST_ERROR' ||
      (config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_ID.includes('mock'));

    if (isAuthFail || config.NODE_ENV === 'development') {
      console.warn(
        '[RAZORPAY MOCK FALLBACK] Razorpay API auth failed or mock credentials in use. Falling back to local dev mock order.'
      );
      order = {
        id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        entity: 'order',
        amount: amountInPaise,
        amount_paid: 0,
        amount_due: amountInPaise,
        currency: 'INR',
        receipt: options.receipt,
        status: 'created',
        attempts: 0,
        notes: options.notes,
        created_at: Math.floor(Date.now() / 1000),
      };
    } else {
      console.error('[RAZORPAY ORDER FAIL] Order creation failed. Expiring reservation hold:', razorpayErr);
      try {
        await transitionState({
          reservationId: reservation._id,
          tenantId: tenantId,
          targetStatus: 'EXPIRED',
          expectedVersion: reservation.__v,
        });
      } catch (transitionErr) {
        console.error('[TRANSITION FAIL] Could not expire reservation after payment failure:', transitionErr);
      }
      throw razorpayErr;
    }
  }

  try {
    // Transition HOLD -> PENDING_PAYMENT via state machine with OCC version
    const updatedReservation = await transitionState({
      reservationId: reservation._id,
      tenantId: tenantId,
      targetStatus: 'PENDING_PAYMENT',
      expectedVersion: reservation.__v,
      paymentDataUpdates: {
        order_id: order.id,
        amount: amountInRupees,
        currency: 'INR',
        status: 'CREATED',
        webhook_processed: false,
        expires_at: new Date(Date.now() + paymentTimeoutMinutes * 60 * 1000),
      },
    });

    return {
      reservation: updatedReservation,
      order,
    };
  } catch (error) {
    console.error('[STATE TRANSITION FAIL] Payment order creation failed:', error);
    throw error;
  }
};

/**
 * Verifies the signature Razorpay Checkout hands back to the browser after a
 * successful payment (HMAC-SHA256 of "order_id|payment_id" keyed with the
 * account's key secret — distinct from the webhook secret) and, if valid,
 * confirms the reservation. This is the authoritative confirmation path the
 * frontend must call; the client-side Razorpay `handler` callback firing is
 * not proof of payment on its own.
 */
const verifyCheckoutPayment = async ({
  reservationId,
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const reservation = await Reservation.findOne({ _id: reservationId, cafe_id: tenantId });
  if (!reservation) {
    throw new BadRequestError('Reservation not found');
  }

  if (reservation.payment_data?.order_id !== razorpayOrderId) {
    throw new BadRequestError('Order ID does not match this reservation');
  }

  const cafe = await Cafe.findById(tenantId);
  const keySecret = cafe?.payments?.configured
    ? decrypt(cafe.payments.razorpay_key_secret_encrypted)
    : config.RAZORPAY_KEY_SECRET; // development mock-order fallback keeps working

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const providedBuffer = Buffer.from(razorpaySignature || '', 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const signatureValid =
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);

  if (!signatureValid) {
    throw new BadRequestError('Invalid payment signature');
  }

  if (reservation.status === 'CONFIRMED') {
    // Already confirmed, likely by the webhook racing this call — idempotent no-op.
    return reservation;
  }

  if (reservation.status !== 'PENDING_PAYMENT') {
    throw new BadRequestError(`Cannot confirm payment for reservation in state ${reservation.status}`);
  }

  return transitionState({
    reservationId: reservation._id,
    tenantId,
    targetStatus: 'CONFIRMED',
    expectedVersion: reservation.__v,
    paymentDataUpdates: {
      payment_id: razorpayPaymentId,
      status: 'SUCCESS',
      webhook_processed: true,
    },
  });
};

module.exports = {
  createOrderForReservation,
  verifyCheckoutPayment,
};
