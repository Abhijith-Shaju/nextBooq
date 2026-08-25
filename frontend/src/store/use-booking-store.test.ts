import { describe, test, expect, beforeEach } from 'vitest';
import { useBookingStore } from './use-booking-store';

// L-02: the booking store previously held its in-progress reservation only
// in memory, so refreshing /checkout (or reopening the tab) lost the live
// hold entirely. Persisted to sessionStorage now — these tests check the
// persistence itself, independent of how any component reacts to it.
describe('useBookingStore persistence', () => {
  const STORAGE_KEY = 'nextbooq-booking-store';

  beforeEach(() => {
    sessionStorage.clear();
    useBookingStore.getState().resetBooking();
  });

  test('writes the reservation to sessionStorage when it is set', () => {
    useBookingStore.getState().setReservation({
      id: 'res_persist_1',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_persist_1',
      amount: 150,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00.000Z',
    });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.reservation).toEqual({
      id: 'res_persist_1',
      status: 'PENDING_PAYMENT',
      razorpay_order_id: 'order_persist_1',
      amount: 150,
      currency: 'INR',
      hold_expires_at: '2026-08-20T19:10:00.000Z',
    });
  });

  test('does not persist the cafe or payment fields', () => {
    useBookingStore.getState().setCafe({
      id: 'cafe_1',
      slug: 'demo-cafe',
      name: 'Demo Cafe',
      timezone: 'UTC',
      reservation_rules: {
        default_turn_time_minutes: 90,
        max_party_size: 12,
        booking_lead_time_hours: 24,
        hold_duration_minutes: 10,
        reservation_fee: 100,
      },
    });
    useBookingStore.getState().setPayment({ some: 'scratch-state' });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : { state: {} };
    expect(parsed.state.cafe).toBeUndefined();
    expect(parsed.state.payment).toBeUndefined();
  });

  test('rehydrating a persisted date revives it as a real Date instance', async () => {
    const persisted = {
      state: {
        partySize: 4,
        date: '2026-09-01T00:00:00.000Z',
        time: '19:00',
        selectedSlot: '19:00',
        reservation: null,
        holdExpiresAt: '2026-09-01T19:10:00.000Z',
      },
      version: 0,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    await useBookingStore.persist.rehydrate();

    const state = useBookingStore.getState();
    expect(state.date).toBeInstanceOf(Date);
    expect(state.date?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(state.holdExpiresAt).toBeInstanceOf(Date);
    expect(state.partySize).toBe(4);
  });
});
