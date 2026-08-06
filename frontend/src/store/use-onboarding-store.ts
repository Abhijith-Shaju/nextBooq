import { create } from 'zustand';

interface OnboardingState {
  step: number;
  orgName: string;
  cafeName: string;
  timezone: string;
  slug: string;
  isSlugAvailable: boolean | null;
  selectedPlan: 'starter' | 'pro' | 'enterprise';

  setStep: (step: number) => void;
  setOrgName: (name: string) => void;
  setCafeName: (name: string) => void;
  setTimezone: (tz: string) => void;
  setSlug: (slug: string) => void;
  setIsSlugAvailable: (available: boolean | null) => void;
  setSelectedPlan: (plan: 'starter' | 'pro' | 'enterprise') => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  step: 1,
  orgName: '',
  cafeName: '',
  timezone: 'Asia/Kolkata',
  slug: '',
  isSlugAvailable: null,
  selectedPlan: 'pro',

  setStep: (step) => set({ step }),
  setOrgName: (orgName) => set({ orgName }),
  setCafeName: (cafeName) => set({ cafeName }),
  setTimezone: (timezone) => set({ timezone }),
  setSlug: (slug) => set({ slug }),
  setIsSlugAvailable: (isSlugAvailable) => set({ isSlugAvailable }),
  setSelectedPlan: (selectedPlan) => set({ selectedPlan }),
  resetOnboarding: () =>
    set({
      step: 1,
      orgName: '',
      cafeName: '',
      timezone: 'Asia/Kolkata',
      slug: '',
      isSlugAvailable: null,
      selectedPlan: 'pro',
    }),
}));
