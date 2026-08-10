const Reservation = require('../models/Reservation');
const { transitionState } = require('./stateMachine');

const expireMatching = async (query, label) => {
  const staleReservations = await Reservation.find(query);

  let expiredCount = 0;

  for (const reservation of staleReservations) {
    try {
      await transitionState({
        reservationId: reservation._id,
        tenantId: reservation.cafe_id,
        targetStatus: 'EXPIRED',
        expectedVersion: reservation.__v,
      });
      expiredCount++;
    } catch (error) {
      // Another request (e.g. a webhook, or a host manually updating status)
      // may have transitioned this reservation concurrently — an OCC
      // conflict here just means it's no longer stale.
      console.warn(`[${label} EXPIRY] Skipping reservation ${reservation._id}:`, error.message);
    }
  }

  return { expiredCount };
};

/**
 * Flips stale PENDING_PAYMENT reservations to EXPIRED so their tables free up.
 * Without this sweep, a customer who abandons checkout (or whose webhook never
 * arrives) permanently blocks the table/slot, since PENDING_PAYMENT is treated
 * as unconditionally blocking elsewhere (unlike HOLD, which is gated by
 * hold_expires_at).
 */
const expireStalePendingPayments = () =>
  expireMatching(
    { status: 'PENDING_PAYMENT', 'payment_data.expires_at': { $ne: null, $lte: new Date() } },
    'PENDING_PAYMENT'
  );

/**
 * Flips HOLD reservations past their hold_expires_at to EXPIRED. Table
 * availability queries already exclude these (hold_expires_at is checked
 * directly), but without this sweep the reservation document itself sits in
 * status HOLD indefinitely and pollutes the host's daily manifest.
 */
const expireStaleHolds = () =>
  expireMatching({ status: 'HOLD', hold_expires_at: { $ne: null, $lte: new Date() } }, 'HOLD');

module.exports = {
  expireStalePendingPayments,
  expireStaleHolds,
};
