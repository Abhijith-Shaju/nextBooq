const { createHoldReservation } = require('../../services/bookingService');
const { createOrderForReservation } = require('../../services/paymentService');
const CafeCustomer = require('../../models/CafeCustomer');
const { BadRequestError } = require('../../utils/errors');

const createReservation = async (req, res, next) => {
  try {
    const { start_time, duration_minutes, party_size, deposit_amount } = req.body;
    const cafeId = req.tenantId;
    const userId = req.user._id;

    if (!start_time || !party_size) {
      throw new BadRequestError('start_time (ISO Date string) and party_size are required');
    }

    const party = parseInt(party_size, 10);
    if (isNaN(party) || party <= 0) {
      throw new BadRequestError('party_size must be greater than 0');
    }

    const startTime = new Date(start_time);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestError('Invalid start_time ISO date string');
    }

    const duration = parseInt(
      duration_minutes || req.cafe.reservation_rules?.default_turn_time_minutes || 90,
      10
    );
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    // 1. Transactional HOLD reservation creation
    const reservation = await createHoldReservation({
      cafeId,
      userId,
      startTime,
      endTime,
      partySize: party,
      reservationTimezone: req.cafe.timezone,
    });

    // 2. Generate Razorpay Payment Order
    const deposit = deposit_amount || 100; // default test deposit amount in INR
    const { order } = await createOrderForReservation(reservation._id, cafeId, deposit);

    // 3. Upsert CafeCustomer rolodex record
    try {
      await CafeCustomer.findOneAndUpdate(
        { cafe_id: cafeId, user_id: userId },
        { $setOnInsert: { cafe_id: cafeId, user_id: userId } },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (err) {
      console.error('Error upserting CafeCustomer rolodex:', err);
    }

    res.status(201).json({
      status: 'success',
      data: {
        reservation_id: reservation._id,
        status: 'PENDING_PAYMENT',
        razorpay_order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        hold_expires_at: reservation.hold_expires_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReservation,
};
