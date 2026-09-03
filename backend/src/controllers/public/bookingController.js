const { createHoldReservation } = require('../../services/bookingService');
const { createOrderForReservation, verifyCheckoutPayment } = require('../../services/paymentService');
const CafeCustomer = require('../../models/CafeCustomer');
const { BadRequestError } = require('../../utils/errors');
const {
  localTimeToUTC,
  isValidDateKey,
  isValidTimeOfDay,
} = require('../../utils/operatingHours');
const config = require('../../config/env');

const createReservation = async (req, res, next) => {
  try {
    const { date, time, start_time, duration_minutes, party_size } = req.body;
    const cafeId = req.tenantId;
    const userId = req.user._id;

    if (!req.user.is_email_verified) {
      throw new BadRequestError('Please verify your email address before making a reservation.');
    }

    // Either shape identifies the slot: the cafe-local `date` + `time` this
    // endpoint now prefers, or the deprecated pre-converted `start_time`.
    // Presence of either date or time selects the cafe-local branch, so a
    // request sending only one of the pair gets a precise complaint about the
    // missing half rather than silently falling through to start_time.
    const usesCafeLocalInput = date !== undefined || time !== undefined;

    if (!usesCafeLocalInput && !start_time) {
      throw new BadRequestError('date (YYYY-MM-DD) and time (HH:mm) are required');
    }
    if (!party_size) {
      throw new BadRequestError('party_size is required');
    }

    const party = Number(party_size);
    if (!Number.isInteger(party) || party <= 0) {
      throw new BadRequestError('party_size must be a positive integer');
    }

    const maxPartySize = req.cafe.reservation_rules?.max_party_size ?? 12;
    if (party > maxPartySize) {
      throw new BadRequestError(`party_size exceeds the maximum of ${maxPartySize} for this cafe`);
    }

    // Slot labels are the cafe's own wall clock, so the cafe's timezone is
    // what resolves them to an instant — and the server owns that timezone,
    // not the client. Clients used to send a pre-converted `start_time`,
    // which made every client responsible for a conversion it had no
    // authority to perform: the web app resolved the slot in the *browser's*
    // timezone, so a diner on any other zone booked a different slot than the
    // one they tapped (and paid a deposit for it). Taking date + time here —
    // the same shape the availability search already speaks — means no client
    // can get it wrong, because no client does the conversion any more.
    let startTime;
    if (usesCafeLocalInput) {
      if (!isValidDateKey(date)) {
        throw new BadRequestError('date must be a real calendar date in YYYY-MM-DD format');
      }
      if (!isValidTimeOfDay(time)) {
        throw new BadRequestError('time must be a wall-clock time in HH:mm format');
      }
      startTime = localTimeToUTC(date, time, req.cafe.timezone);
    } else {
      // Deprecated: pre-converted UTC instant. Retained so a client deployed
      // before this change keeps working across the rollout window (the
      // frontend and API deploy independently). Remove once no client sends
      // it — until then this branch is the one remaining way to get the
      // conversion wrong.
      if (typeof start_time !== 'string') {
        throw new BadRequestError('start_time must be an ISO date string');
      }
      startTime = new Date(start_time);
    }

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

    // The amount charged is the cafe's own configured reservation fee — never
    // client-supplied, so a tampered request body can't under- or over-charge
    // the customer relative to what the cafe owner set in Settings.
    const reservationFee = Number(req.cafe.reservation_rules?.reservation_fee ?? 100);
    if (!Number.isFinite(reservationFee) || reservationFee <= 0) {
      throw new BadRequestError('This cafe has not configured a valid reservation fee.');
    }

    if (!req.cafe.payments?.configured && config.NODE_ENV !== 'development') {
      throw new BadRequestError("This cafe hasn't finished setting up payments yet.");
    }

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
    const { order } = await createOrderForReservation(reservation._id, cafeId, reservationFee);

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
        amount: reservationFee, // rupees, matching payment_data.amount — not order.amount (paise)
        currency: order.currency,
        hold_expires_at: reservation.hold_expires_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new BadRequestError(
        'razorpay_order_id, razorpay_payment_id and razorpay_signature are required'
      );
    }

    const reservation = await verifyCheckoutPayment({
      reservationId: req.params.reservationId,
      tenantId: req.tenantId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    res.status(200).json({
      status: 'success',
      data: {
        reservation_id: reservation._id,
        status: reservation.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createReservation,
  verifyPayment,
};
