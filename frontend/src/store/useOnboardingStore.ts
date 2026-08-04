import { create } from 'zustand';

interface OnboardingState {
  step: number;
  email: string;
  phone: string;
  name: string;
  cafeName: string;
  slug: string;
  timezone: string;
  selectedPlan: 'pro' | 'enterprise';
  
  // Actions
  setStep: (step: number) => void;
  setIdentity: (data: { email: string; phone: string; name: string }) => void;
  setCafeDetails: (data: { cafeName: string; slug: string; timezone: string }) => void;
  setSelectedPlan: (plan: 'pro' | 'enterprise') => void;
  resetOnboarding: () => void;
}

const initialState = {
  step: 1,
  email: '',
  phone: '',
  name: '',
  cafeName: '',
  slug: '',
  timezone: 'Asia/Kolkata',
  selectedPlan: 'pro' as const,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,

  setStep: (step) => set({ step }),
  setIdentity: (data) => set((state) => ({ ...state, ...data })),
  setCafeDetails: (data) => set((state) => ({ ...state, ...data })),
  setSelectedPlan: (selectedPlan) => set({ selectedPlan }),
  resetOnboarding: () => set(initialState),
}));
