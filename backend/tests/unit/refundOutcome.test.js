const { describeRefundOutcome } = require('../../src/services/refundOutcome');

const HOURS = 60 * 60 * 1000;
const NOW = new Date('2026-09-08T12:00:00Z');

const booking = ({ hoursAway = 48, paid = true, refundable = true, cutoff = 24, amount = 250 } = {}) => ({
  start_time: new Date(NOW.getTime() + hoursAway * HOURS),
  payment_data: paid
    ? { payment_id: 'pay_x', amount, currency: 'INR' }
    : { amount, currency: 'INR' },
  fee_policy: { refund_on_cancellation: refundable, cancellation_cutoff_hours: cutoff },
});

// Four things read this: the refunds-owed flag, the cancellation response, the
// toast that response drives, and the cancellation email. They agree only
// because they all call this, so its edges are worth pinning down.
describe('describeRefundOutcome', () => {
  test('owes the fee back when the guest gave the notice the terms asked for', () => {
    const outcome = describeRefundOutcome(booking({ hoursAway: 48, cutoff: 24 }), NOW);

    expect(outcome).toMatchObject({ fee_paid: true, refund_due: true, reason: null, amount: 250 });
  });

  test('owes nothing when the cancellation came later than the cutoff', () => {
    const outcome = describeRefundOutcome(booking({ hoursAway: 3, cutoff: 24 }), NOW);

    expect(outcome).toMatchObject({ fee_paid: true, refund_due: false, reason: 'late' });
    // The guest is told the number they missed, so carry it.
    expect(outcome.cutoff_hours).toBe(24);
  });

  test('treats exactly the cutoff as in time', () => {
    // A boundary someone will land on eventually, and "24 hours' notice"
    // should mean 24 hours qualifies rather than narrowly missing.
    const outcome = describeRefundOutcome(booking({ hoursAway: 24, cutoff: 24 }), NOW);

    expect(outcome.refund_due).toBe(true);
  });

  test('owes nothing on non-refundable terms however early the guest cancels', () => {
    const outcome = describeRefundOutcome(booking({ hoursAway: 500, refundable: false }), NOW);

    expect(outcome).toMatchObject({ refund_due: false, reason: 'non_refundable' });
  });

  test('non-refundable terms take precedence over the notice given', () => {
    // Both would withhold the fee; the guest should be told the real reason,
    // not that they were late when the terms never promised anything.
    const outcome = describeRefundOutcome(booking({ hoursAway: 1, refundable: false }), NOW);

    expect(outcome.reason).toBe('non_refundable');
  });

  test('an unpaid booking has nothing to explain', () => {
    const outcome = describeRefundOutcome(booking({ paid: false, hoursAway: 1 }), NOW);

    expect(outcome).toMatchObject({ fee_paid: false, refund_due: false, reason: null });
  });

  test('a past booking counts as late rather than as negative notice', () => {
    const outcome = describeRefundOutcome(booking({ hoursAway: -5 }), NOW);

    expect(outcome).toMatchObject({ refund_due: false, reason: 'late' });
  });

  describe('missing terms', () => {
    test('a booking with no fee_policy falls back to a day of notice', () => {
      // Bookings taken before fee_policy existed. Twenty-four hours matches
      // the Cafe model's own default rather than inventing a second one.
      const legacy = { start_time: new Date(NOW.getTime() + 48 * HOURS), payment_data: { payment_id: 'p', amount: 100, currency: 'INR' } };

      expect(describeRefundOutcome(legacy, NOW)).toMatchObject({ refund_due: true, cutoff_hours: 24 });
    });

    test('and refuses a late one on that same default', () => {
      const legacy = { start_time: new Date(NOW.getTime() + 2 * HOURS), payment_data: { payment_id: 'p', amount: 100, currency: 'INR' } };

      expect(describeRefundOutcome(legacy, NOW)).toMatchObject({ refund_due: false, reason: 'late' });
    });

    test('survives a booking with no payment_data at all', () => {
      const bare = { start_time: new Date(NOW.getTime() + 48 * HOURS) };

      expect(describeRefundOutcome(bare, NOW)).toMatchObject({ fee_paid: false, amount: 0, currency: 'INR' });
    });
  });
});
