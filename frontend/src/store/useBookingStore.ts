import { create } from 'zustand';

interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
}

interface BookingState {
  step: number;
  partySize: number;
  selectedDate: string; // YYYY-MM-DD
  selectedTime: string; // HH:mm
  customerInfo: CustomerInfo;
  holdId: string | null;
  razorpayOrderId: string | null;
  
  // Actions
  setStep: (step: number) => void;
  setPartySize: (size: number) => void;
  setSelectedDate: (date: string) => void;
  setSelectedTime: (time: string) => void;
  setCustomerInfo: (info: Partial<CustomerInfo>) => void;
  setHold: (holdId: string, orderId?: string) => void;
  resetBooking: () => void;
}

const initialDate = new Date().toISOString().split('T')[0];

const initialState = {
  step: 1,
  partySize: 2,
  selectedDate: initialDate,
  selectedTime: '',
  customerInfo: { name: '', phone: '', email: '' },
  holdId: null,
  razorpayOrderId: null,
};

export const useBookingStore = create<BookingState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setPartySize: (partySize) => set({ partySize }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedTime: (selectedTime) => set({ selectedTime }),
  setCustomerInfo: (info) =>
    set((state) => ({ customerInfo: { ...state.customerInfo, ...info } })),
  setHold: (holdId, orderId) =>
    set({ holdId, razorpayOrderId: orderId || null }),
  resetBooking: () => set(initialState),
}));
