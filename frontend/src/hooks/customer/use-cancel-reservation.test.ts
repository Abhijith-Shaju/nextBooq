import { describe, test, expect } from 'vitest';
import { describeCancellation, type CancelReservationResult } from './use-cancel-reservation';

const result = (overrides: Partial<CancelReservationResult> = {}): CancelReservationResult => ({
  _id: 'res_1',
  status: 'CANCELLED',
  refund_due: false,
  fee_paid: true,
  refund_withheld_reason: null,
  cutoff_hours: 24,
  amount: 250,
  currency: 'INR',
  ...overrides,
});

describe('describeCancellation', () => {
  test('names the amount and who issues it when a refund is due', () => {
    const message = describeCancellation(result({ refund_due: true }));

    expect(message).toContain('₹250');
    // Not "we will refund you" — nextBooq never holds the money and cannot
    // make the cafe act. The refund policy is careful about this and the toast
    // must not contradict it.
    expect(message).toMatch(/cafe issues refunds from its own account/i);
    expect(message).toMatch(/5–7 business days/);
  });

  test('explains a withheld fee rather than going silent', () => {
    // The whole point: a guest who paid and gets nothing back was previously
    // told only "Booking cancelled." and left to assume we kept it.
    const message = describeCancellation(
      result({ refund_due: false, refund_withheld_reason: 'late', cutoff_hours: 24 })
    );

    expect(message).toContain('₹250');
    expect(message).toMatch(/not refunded/i);
    expect(message).toMatch(/24 hours/);
  });

  test('gives non-refundable terms as the reason when that is the reason', () => {
    const message = describeCancellation(
      result({ refund_withheld_reason: 'non_refundable' })
    );

    expect(message).toMatch(/non-refundable terms/i);
    expect(message).not.toMatch(/notice/i);
  });

  test('stays short when no fee was ever paid', () => {
    const message = describeCancellation(result({ fee_paid: false, amount: 0 }));

    expect(message).toBe('Booking cancelled.');
  });

  test('falls back safely when the server sends nothing back', () => {
    expect(describeCancellation(undefined)).toBe('Booking cancelled.');
  });

  test('formats a non-integer fee to two places', () => {
    const message = describeCancellation(result({ refund_due: true, amount: 249.5 }));

    expect(message).toContain('₹249.50');
  });

  test('uses the currency code for anything that is not rupees', () => {
    const message = describeCancellation(result({ refund_due: true, currency: 'USD', amount: 10 }));

    expect(message).toContain('USD 10');
  });
});
