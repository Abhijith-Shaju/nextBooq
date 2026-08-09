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

    const party = Number(party_size);
    if (!Number.isInteger(party) || party <= 0) {
      throw new BadRequestError('party_size must be a positive integer');
    }

    const maxPartySize = req.cafe.reservation_rules?.max_party_size ?? 12;
    if (party > maxPartySize) {
      throw new BadRequestError(`party_size exceeds the maximum of ${maxPartySize} for this cafe`);
    }

    const startTime = new Date(start_time);
    if (isNaN(startTime.getTime())) {
      throw new BadRequestError('Invalid start_time ISO date string');
    }

    const leadTimeHours = req.cafe.reservation_rules?.booking_lead_time_hours ?? 24;
    // Small grace window absorbs request latency between when a client computed
    // "now + leadTimeHours" and when this handler re-evaluates it server-side, so a
    // booking made exactly at the lead-time boundary isn't flaky-rejected by a few ms.
    const leadTimeGraceMs = 60 * 1000;
    const earliestAllowedStart = new Date(
      Date.now() + leadTimeHours * 60 * 60 * 1000 - leadTimeGraceMs
    );
    if (startTime < earliestAllowedStart) {
      throw new BadRequestError(
        `Reservations must be made at least ${leadTimeHours} hour(s) in advance`
      );
    }

    let duration;
    if (duration_minutes === undefined || duration_minutes === null || duration_minutes === '') {
      duration = Number(req.cafe.reservation_rules?.default_turn_time_minutes ?? 90);
    } else {
      duration = Number(duration_minutes);
    }
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new BadRequestError('duration_minutes must be a positive integer');
    }
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
