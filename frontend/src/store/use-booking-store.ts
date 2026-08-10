import { create } from 'zustand';
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

export const useBookingStore = create<BookingState>((set) => ({
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
}));
