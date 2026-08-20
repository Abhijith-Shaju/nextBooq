import { SuccessCard } from '@/components/booking/success-card';
import { EmailVerificationBanner } from '@/components/shared/email-verification-banner';

export default function SuccessPage() {
  return (
    <div className="min-h-screen">
      <EmailVerificationBanner className="sticky top-0 z-40" />
      <div className="container mx-auto px-4 py-12 min-h-screen flex items-center justify-center">
        <SuccessCard />
      </div>
    </div>
  );
}
