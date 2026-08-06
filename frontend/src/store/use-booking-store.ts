import { create } from 'zustand';
import { Cafe, Reservation } from '@/lib/types/models';

interface BookingState {
  cafe: Cafe | null;
  partySize: number;
  date: Date | null;
  time: string | null;
  selectedSlot: string | null;
  reservation: Reservation | null;
  payment: any | null;
  holdExpiresAt: Date | null;
  
  setCafe: (cafe: Cafe) => void;
  setPartySize: (size: number) => void;
  setDate: (date: Date) => void;
  setTime: (time: string) => void;
  setReservation: (reservation: Reservation) => void;
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
