// A cafe that has never set a cutoff is treated as asking for a day's notice,
// matching the Cafe model's own default for reservation_rules.
const DEFAULT_CANCELLATION_CUTOFF_HOURS = 24;

/**
 * Whether a cancelled booking owes the guest their fee back, and if not, why.
 *
 * One place because the answer is told to the guest three times — in the
 * cancellation response, in the toast that response drives, and in the
 * cancellation email — and it is also what puts the booking on the cafe's
 * refunds-owed queue. Four derivations of the same rule would eventually
 * disagree, and the guest would be reading one answer while the cafe's queue
 * showed another.
 *
 * Reads the terms recorded on the booking, never the cafe's current settings:
 * a cafe that changes its policy today cannot rewrite the deal a guest already
 * paid under.
 *
 * @returns {{
 *   fee_paid: boolean,
 *   refund_due: boolean,
 *   reason: null | 'late' | 'non_refundable',
 *   amount: number,
 *   currency: string,
 *   cutoff_hours: number,
 * }}
 */
const describeRefundOutcome = (reservation, now = new Date()) => {
  const payment = reservation.payment_data || {};
  const amount = payment.amount ?? 0;
  const currency = payment.currency || 'INR';
  const cutoffHours =
    reservation.fee_policy?.cancellation_cutoff_hours ?? DEFAULT_CANCELLATION_CUTOFF_HOURS;

  const base = { amount, currency, cutoff_hours: cutoffHours };

  // No money was captured, so there is nothing to return and nothing to
  // explain. A held or unpaid booking lands here.
  if (!payment.payment_id) {
    return { ...base, fee_paid: false, refund_due: false, reason: null };
  }

  if ((reservation.fee_policy?.refund_on_cancellation ?? true) === false) {
    return { ...base, fee_paid: true, refund_due: false, reason: 'non_refundable' };
  }

  const hoursOfNotice = (new Date(reservation.start_time).getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hoursOfNotice < cutoffHours) {
    return { ...base, fee_paid: true, refund_due: false, reason: 'late' };
  }

  return { ...base, fee_paid: true, refund_due: true, reason: null };
};

module.exports = { describeRefundOutcome, DEFAULT_CANCELLATION_CUTOFF_HOURS };
