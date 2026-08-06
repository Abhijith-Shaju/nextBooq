import type { Metadata } from 'next';
import { OnboardingWizard } from '@/components/control-plane/onboarding-wizard';

export const metadata: Metadata = {
  title: 'Provision Your Cafe — nextBooq Onboarding',
  description: 'Setup your cafe organization, custom domain slug, and subscription plan.',
};

export default function OnboardingPage() {
  return (
    <div className="py-10">
      <OnboardingWizard />
    </div>
  );
}
