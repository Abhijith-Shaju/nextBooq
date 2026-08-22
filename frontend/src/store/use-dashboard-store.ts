import { create } from 'zustand';
import { format } from 'date-fns';

interface DashboardState {
  selectedDate: string; // YYYY-MM-DD
  selectedReservationId: string | null;
  isDrawerOpen: boolean;
  tableFilter: 'all' | 'active' | 'out_of_service';
  assignTableTargetId: string | null;
  isAssignTableOpen: boolean;

  setSelectedDate: (date: string) => void;
  setSelectedReservationId: (id: string | null) => void;
  openDrawer: (reservationId: string) => void;
  closeDrawer: () => void;
  setTableFilter: (filter: 'all' | 'active' | 'out_of_service') => void;
  openAssignTable: (tableId: string) => void;
  closeAssignTable: () => void;
  reset: () => void;
}

const initialDashboardState = {
  selectedDate: format(new Date(), 'yyyy-MM-dd'),
  selectedReservationId: null,
  isDrawerOpen: false,
  tableFilter: 'all' as const,
  assignTableTargetId: null,
  isAssignTableOpen: false,
};

export const useDashboardStore = create<DashboardState>((set) => ({
  ...initialDashboardState,

  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setSelectedReservationId: (selectedReservationId) => set({ selectedReservationId }),
  openDrawer: (selectedReservationId) => set({ selectedReservationId, isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  setTableFilter: (tableFilter) => set({ tableFilter }),
  openAssignTable: (assignTableTargetId) => set({ assignTableTargetId, isAssignTableOpen: true }),
  closeAssignTable: () => set({ isAssignTableOpen: false }),
  // selectedDate is intentionally re-derived (not reset to the stale initial
  // value) so this stays correct no matter how long the tab's been open.
  reset: () => set({ ...initialDashboardState, selectedDate: format(new Date(), 'yyyy-MM-dd') }),
}));
