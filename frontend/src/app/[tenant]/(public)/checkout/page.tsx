import { CheckoutCard } from '@/components/booking/checkout-card';
import { EmailVerificationBanner } from '@/components/shared/email-verification-banner';

export default function CheckoutPage() {
  return (
    <div className="min-h-screen">
      <EmailVerificationBanner className="sticky top-0 z-40" />
      <div className="container mx-auto px-4 py-12 min-h-screen flex items-center justify-center">
        <CheckoutCard />
      </div>
    </div>
  );
}
