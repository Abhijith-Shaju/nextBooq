import { create } from 'zustand';

interface DashboardState {
  activeDate: string; // YYYY-MM-DD
  selectedTableId: string | null;
  selectedReservationId: string | null;
  statusFilter: string; // 'ALL' or specific status
  
  // Actions
  setActiveDate: (date: string) => void;
  setSelectedTableId: (tableId: string | null) => void;
  setSelectedReservationId: (resId: string | null) => void;
  setStatusFilter: (filter: string) => void;
}

const today = new Date().toISOString().split('T')[0];

export const useDashboardStore = create<DashboardState>((set) => ({
  activeDate: today,
  selectedTableId: null,
  selectedReservationId: null,
  statusFilter: 'ALL',

  setActiveDate: (activeDate) => set({ activeDate }),
  setSelectedTableId: (selectedTableId) => set({ selectedTableId }),
  setSelectedReservationId: (selectedReservationId) => set({ selectedReservationId }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));
