const Reservation = require('../models/Reservation');
const CafeCustomer = require('../models/CafeCustomer');
const User = require('../models/User');
const Cafe = require('../models/Cafe');
const { ConflictError, UnprocessableEntityError, NotFoundError } = require('../utils/errors');
const { notifyCafeRoom } = require('./socketService');
const { sendBookingConfirmationEmail, sendBookingCancellationEmail } = require('./emailService');
const { formatLocalDateTime } = require('../utils/operatingHours');
const { describeRefundOutcome } = require('./refundOutcome');

/**
 * Emails the guest about a booking that has just confirmed or been cancelled.
 *
 * Never awaited by the transition that triggers it. By this point the change
 * is committed, so a slow or failing email provider must not turn it into a
 * failed request; the booking is correct either way and still visible in the
 * guest's reservations.
 */
const notifyGuestOfTransition = async (reservation, targetStatus) => {
  const [user, cafe] = await Promise.all([
    User.findById(reservation.user_id).select('email name').lean(),
    Cafe.findById(reservation.cafe_id).select('name slug timezone').lean(),
  ]);

  if (!user?.email || !cafe) return;

  const common = {
    to: user.email,
    guestName: user.name,
    cafeName: cafe.name,
    cafeSlug: cafe.slug,
    // Formatted in the cafe's timezone, not the server's: a guest told to
    // arrive at the UTC hour would miss the table they paid for.
    when: formatLocalDateTime(reservation.start_time, cafe.timezone),
  };

  if (targetStatus === 'CONFIRMED') {
    await sendBookingConfirmationEmail({
      ...common,
      partySize: reservation.party_size,
      amount: reservation.payment_data?.amount ?? 0,
      currency: reservation.payment_data?.currency || 'INR',
    });
    return;
  }

  // A guest holding a confirmation email for a table that no longer exists
  // will search their inbox on the day, find it, and turn up. The
  // cancellation notice is what corrects that -- and it is the only durable
  // record of what happens to their fee, since a toast is gone as soon as
  // they navigate away.
  await sendBookingCancellationEmail({ ...common, outcome: describeRefundOutcome(reservation) });
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
  // Whether the fee comes back, decided in one place — see refundOutcome.js.
  // The guest is told this same answer in the cancellation response and in the
  // cancellation email, and it is what puts the booking on the cafe's
  // refunds-owed queue, so all of them read the one helper.
  //
  // Note the cutoff inside it governs the money, not the permission.
  // Cancelling late is still allowed and still frees the table, which is
  // better for the cafe than a guest who simply does not turn up.
  if (targetStatus === 'CANCELLED' && describeRefundOutcome(reservation).refund_due) {
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

  // Sent here rather than at the call sites, because several of them reach the
  // same transition -- the checkout return and the Razorpay webhook both try
  // to confirm, and both a guest and a member of staff can cancel -- and
  // exactly one wins the OCC update above. Hooking the transition means one
  // email per change, however it was reached, and no path can forget to send
  // it.
  //
  // Cancellation is only worth an email for a booking that actually existed:
  // `confirmed_at` is set on CONFIRMED, so an abandoned hold or an unpaid
  // pending-payment row cancels quietly rather than mailing someone about a
  // table they never held.
  const worthNotifying =
    targetStatus === 'CONFIRMED' ||
    (targetStatus === 'CANCELLED' && Boolean(updatedReservation.confirmed_at));

  if (worthNotifying) {
    notifyGuestOfTransition(updatedReservation, targetStatus).catch((err) => {
      console.error(`[stateMachine] Guest ${targetStatus} email failed:`, err);
    });
  }

  return updatedReservation;
};

module.exports = {
  VALID_TRANSITIONS,
  transitionState,
};
