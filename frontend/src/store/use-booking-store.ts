import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Cafe } from '@/lib/types/models';

// Shape of the in-progress booking's reservation, as returned by the hold-creation
// endpoint. This is intentionally narrower than the full `Reservation` API model
// (no guest_name/guest_email/etc.) since that's all the checkout flow has.
export interface BookingHoldReservation {
  id: string;
  status: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  hold_expires_at: string;
}

interface BookingState {
  cafe: Cafe | null;
  partySize: number;
  date: Date | null;
  time: string | null;
  selectedSlot: string | null;
  reservation: BookingHoldReservation | null;
  payment: any | null;
  holdExpiresAt: Date | null;

  setCafe: (cafe: Cafe) => void;
  setPartySize: (size: number) => void;
  setDate: (date: Date) => void;
  setTime: (time: string) => void;
  setReservation: (reservation: BookingHoldReservation) => void;
  setPayment: (payment: any) => void;
  setHoldExpiresAt: (date: Date) => void;
  clearBooking: () => void;
  resetBooking: () => void;
}

// Fields persisted to sessionStorage across a refresh (L-02) -- excludes
// `cafe` (already re-resolved fresh from the URL by TenantProvider on every
// load, so a stale cached copy would only be a liability) and `payment`
// (never actually read anywhere in this codebase; dead state, not worth
// carrying across a refresh).
type PersistedBookingFields = Pick<
  BookingState,
  'partySize' | 'date' | 'time' | 'selectedSlot' | 'reservation' | 'holdExpiresAt'
>;

export const useBookingStore = create<BookingState>()(
  persist(
    (set) => ({
      cafe: null,
      partySize: 2,
      date: null,
      time: null,
      selectedSlot: null,
      reservation: null,
      payment: null,
      holdExpiresAt: null,

      setCafe: (cafe) => set({ cafe }),
      setPartySize: (partySize) => set({ partySize }),
      setDate: (date) => set({ date, time: null, selectedSlot: null }),
      setTime: (time) => set({ time, selectedSlot: time }),
      setReservation: (reservation) => set({ reservation }),
      setPayment: (payment) => set({ payment }),
      setHoldExpiresAt: (holdExpiresAt) => set({ holdExpiresAt }),
      clearBooking: () => set({ date: null, time: null, selectedSlot: null, reservation: null, payment: null, holdExpiresAt: null }),
      resetBooking: () => set({ partySize: 2, date: null, time: null, selectedSlot: null, reservation: null, payment: null, holdExpiresAt: null }),
    }),
    {
      name: 'nextbooq-booking-store',
      // sessionStorage, not localStorage: this is scoped to finishing (or
      // abandoning) one checkout in one tab, not a booking that should
      // resurface days later or leak across tabs.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state): PersistedBookingFields => ({
        partySize: state.partySize,
        date: state.date,
        time: state.time,
        selectedSlot: state.selectedSlot,
        reservation: state.reservation,
        holdExpiresAt: state.holdExpiresAt,
      }),
      // Date instances don't survive JSON.stringify/parse -- persisted as
      // ISO strings, so they need reviving back into real Date objects on
      // the way out of storage.
      merge: (persisted, current) => {
        const p = persisted as Partial<PersistedBookingFields> | undefined;
        if (!p) return current;
        return {
          ...current,
          ...p,
          date: p.date ? new Date(p.date) : null,
          holdExpiresAt: p.holdExpiresAt ? new Date(p.holdExpiresAt) : null,
        };
      },
    }
  )
);
