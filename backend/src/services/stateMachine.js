const Reservation = require('../models/Reservation');
const CafeCustomer = require('../models/CafeCustomer');
const User = require('../models/User');
const Cafe = require('../models/Cafe');
const { ConflictError, UnprocessableEntityError, NotFoundError } = require('../utils/errors');
const { notifyCafeRoom } = require('./socketService');
const { sendBookingConfirmationEmail } = require('./emailService');
const { formatLocalDateTime } = require('../utils/operatingHours');

/**
 * Emails the guest that their table is confirmed.
 *
 * Never awaited by the transition that triggers it. By this point the booking
 * is committed and the guest has been charged, so a slow or failing email
 * provider must not turn a paid reservation into a failed request. If the mail
 * never arrives the booking still exists and is still visible in the guest's
 * reservations.
 */
const sendConfirmationToGuest = async (reservation) => {
  const [user, cafe] = await Promise.all([
    User.findById(reservation.user_id).select('email name').lean(),
    Cafe.findById(reservation.cafe_id).select('name slug timezone').lean(),
  ]);

  if (!user?.email || !cafe) return;

  await sendBookingConfirmationEmail({
    to: user.email,
    guestName: user.name,
    cafeName: cafe.name,
    cafeSlug: cafe.slug,
    // Formatted in the cafe's timezone, not the server's: a guest told to
    // arrive at the UTC hour would miss the table they paid for.
    when: formatLocalDateTime(reservation.start_time, cafe.timezone),
    partySize: reservation.party_size,
    amount: reservation.payment_data?.amount ?? 0,
    currency: reservation.payment_data?.currency || 'INR',
  });
};

// Keeps the per-cafe customer rolodex (repeat-visit/no-show history) in sync
// with reservation outcomes. Upserts because a guest's first-ever visit won't
// have a CafeCustomer record yet at booking time in every code path.
const CUSTOMER_COUNTER_FIELD_BY_STATUS = {
  COMPLETED: 'total_visits',
  NO_SHOW: 'total_no_shows',
};

const recordCustomerOutcome = async (cafeId, userId, targetStatus) => {
  const field = CUSTOMER_COUNTER_FIELD_BY_STATUS[targetStatus];
  if (!field) return;

  await CafeCustomer.findOneAndUpdate(
    { cafe_id: cafeId, user_id: userId },
    { $inc: { [field]: 1 }, $setOnInsert: { cafe_id: cafeId, user_id: userId } },
    { upsert: true }
  );
};

const VALID_TRANSITIONS = {
  HOLD: ['PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'],
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  // CONFIRMED -> SEATED is intentional, not a missing CHECKED_IN step: CHECKED_IN
  // models a guest checking in at the host stand ahead of their table being ready,
  // but a host can also seat a CONFIRMED party directly the moment they walk in
  // and a table is free. In that path checked_in_at legitimately stays null while
  // seated_at is set — that's expected, not a data-integrity bug.
  CONFIRMED: ['CHECKED_IN', 'SEATED', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['SEATED', 'LEFT_BEFORE_SEATING'],
  SEATED: ['COMPLETED'],
  // Terminal states (no transitions allowed out)
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  NO_SHOW: [],
  LEFT_BEFORE_SEATING: [],
};

const TIMESTAMP_FIELDS = {
  CONFIRMED: 'confirmed_at',
  CHECKED_IN: 'checked_in_at',
  SEATED: 'seated_at',
  COMPLETED: 'completed_at',
  CANCELLED: 'cancelled_at',
};

/**
 * Transitions a reservation to a target status using strict matrix checks and OCC versioning.
 */
const transitionState = async ({
  reservationId,
  tenantId,
  targetStatus,
  expectedVersion,
  updatedByUserId = null,
  paymentDataUpdates = null,
  tableIdsUpdate = null,
}) => {
  const reservation = await Reservation.findOne({ _id: reservationId, cafe_id: tenantId });
  if (!reservation) {
    throw new NotFoundError('Reservation not found');
  }

  // Check OCC version before state validation
  if (expectedVersion !== undefined && expectedVersion !== null && reservation.__v !== expectedVersion) {
    throw new ConflictError(
      `OCC Conflict: Reservation version ${expectedVersion} has already been modified by another request. Please refresh and try again.`
    );
  }

  const currentStatus = reservation.status;

  // Validate state transition matrix
  const allowedNextStates = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowedNextStates.includes(targetStatus)) {
    throw new UnprocessableEntityError(
      `Illegal status transition from ${currentStatus} to ${targetStatus}`
    );
  }

  // Prepare update payload
  const updateQuery = {
    status: targetStatus,
    $inc: { __v: 1 },
    $push: {
      status_history: {
        status: targetStatus,
        timestamp: new Date(),
        updated_by: updatedByUserId,
      },
    },
  };

  // Set relevant lifecycle timestamp field if applicable
  const timestampField = TIMESTAMP_FIELDS[targetStatus];
  if (timestampField) {
    updateQuery[timestampField] = new Date();
  }

  if (paymentDataUpdates) {
    Object.keys(paymentDataUpdates).forEach((key) => {
      updateQuery[`payment_data.${key}`] = paymentDataUpdates[key];
    });
  }

  // Reassigning a party to a different table on seating: folding table_ids
  // into this same OCC-guarded update keeps the table move and the status
  // change atomic for this reservation.
  if (tableIdsUpdate && tableIdsUpdate.length > 0) {
    updateQuery.table_ids = tableIdsUpdate;
  }

  // Cancelling a reservation whose fee was actually captured leaves money with
  // the cafe that the guest is owed back. nextBooq does not move money out of a
  // cafe's Razorpay account on its behalf, so the cancellation cannot itself
  // issue the refund -- but it must not be silent about it either. Flagging it
  // here puts the reservation on the cafe's refunds-owed queue, reusing the
  // same field the webhook path already uses when a payment lands on a
  // reservation that can no longer be honoured.
  //
  // Only when the fee was captured (payment_id present) and only when the
  // cafe's own terms, as recorded on this booking, promise a refund. A booking
  // taken under non-refundable terms owes nothing back.
  const feeWasCaptured = Boolean(reservation.payment_data?.payment_id);
  const termsPromiseRefund = reservation.fee_policy?.refund_on_cancellation ?? true;
  if (targetStatus === 'CANCELLED' && feeWasCaptured && termsPromiseRefund) {
    updateQuery['payment_data.requires_manual_refund'] = true;
  }

  // Execute OCC Update
  const updatedReservation = await Reservation.findOneAndUpdate(
    {
      _id: reservationId,
      cafe_id: tenantId,
      __v: expectedVersion,
    },
    updateQuery,
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedReservation) {
    throw new ConflictError(
      `OCC Conflict: Reservation version ${expectedVersion} has already been modified by another request. Please refresh and try again.`
    );
  }

  await recordCustomerOutcome(tenantId, updatedReservation.user_id, targetStatus);

  // Push a real-time update to the cafe's dashboard (host stand manifest,
  // floorplan) so staff see status changes without a manual refresh.
  notifyCafeRoom(tenantId.toString(), 'reservation_updated', {
    reservationId: updatedReservation._id.toString(),
    status: updatedReservation.status,
  });

  // Sent here rather than at the two call sites that confirm a booking (the
  // checkout return and the Razorpay webhook) because exactly one of them wins
  // the OCC update above -- so the guest gets one email however their payment
  // came back, and neither path can forget to send it.
  if (targetStatus === 'CONFIRMED') {
    sendConfirmationToGuest(updatedReservation).catch((err) => {
      console.error('[stateMachine] Booking confirmation email failed:', err);
    });
  }

  return updatedReservation;
};

module.exports = {
  VALID_TRANSITIONS,
  transitionState,
};
