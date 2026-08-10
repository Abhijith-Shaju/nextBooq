import { create } from 'zustand';
import { format } from 'date-fns';

interface DashboardState {
  selectedDate: string; // YYYY-MM-DD
  selectedReservationId: string | null;
  isDrawerOpen: boolean;
  tableFilter: 'all' | 'active' | 'out_of_service';

  setSelectedDate: (date: string) => void;
  setSelectedReservationId: (id: string | null) => void;
  openDrawer: (reservationId: string) => void;
  closeDrawer: () => void;
  setTableFilter: (filter: 'all' | 'active' | 'out_of_service') => void;
  reset: () => void;
}

const initialDashboardState = {
  selectedDate: format(new Date(), 'yyyy-MM-dd'),
  selectedReservationId: null,
  isDrawerOpen: false,
  tableFilter: 'all' as const,
};

export const useDashboardStore = create<DashboardState>((set) => ({
  ...initialDashboardState,

  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedReservationId: (selectedReservationId) => set({ selectedReservationId }),
  openDrawer: (selectedReservationId) => set({ selectedReservationId, isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  setTableFilter: (tableFilter) => set({ tableFilter }),
  // selectedDate is intentionally re-derived (not reset to the stale initial
  // value) so this stays correct no matter how long the tab's been open.
  reset: () => set({ ...initialDashboardState, selectedDate: format(new Date(), 'yyyy-MM-dd') }),
}));
