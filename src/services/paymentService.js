const razorpay = require('../config/razorpay');
const Reservation = require('../models/Reservation');
const { transitionState } = require('./stateMachine');
const { BadRequestError } = require('../utils/errors');

/**
 * Creates a Razorpay Order and transitions reservation HOLD -> PENDING_PAYMENT.
 */
const createOrderForReservation = async (reservationId, tenantId, amountInRupees) => {
  const reservation = await Reservation.findOne({ _id: reservationId, cafe_id: tenantId });
  if (!reservation) {
    throw new BadRequestError('Reservation not found');
  }

  if (reservation.status !== 'HOLD') {
    throw new BadRequestError(`Cannot create payment order for reservation in state ${reservation.status}`);
  }

  const amountInPaise = Math.round(amountInRupees * 100);

  try {
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `res_${reservation._id.toString().slice(-8)}_${Date.now().toString().slice(-6)}`,
      notes: {
        reservation_id: reservation._id.toString(),
        cafe_id: tenantId.toString(),
      },
    };

    const order = await razorpay.orders.create(options);

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
      },
    });

    return {
      reservation: updatedReservation,
      order,
    };
  } catch (error) {
    console.error('[RAZORPAY ORDER FAIL] Order creation failed. Expiring reservation hold:', error);
    // Transition HOLD -> EXPIRED immediately to release table inventory
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
    throw error;
  }
};

module.exports = {
  createOrderForReservation,
};
