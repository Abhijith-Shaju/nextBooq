'use client';

import { useState, useEffect } from 'react';
import { useOnboardingStore } from '@/store/use-onboarding-store';
import { useCreateCafe } from '@/hooks/admin/use-create-cafe';
import { PricingCards } from '@/components/control-plane/pricing-cards';
import { Check, Loader2, ArrowRight, ArrowLeft, Globe, Building, Clock, Sparkles } from 'lucide-react';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function OnboardingWizard() {
  const router = useRouter();
  const {
    step,
    orgName,
    cafeName,
    timezone,
    slug,
    isSlugAvailable,
    selectedPlan,
    setStep,
    setOrgName,
    setCafeName,
    setTimezone,
    setSlug,
    setIsSlugAvailable,
    resetOnboarding,
  } = useOnboardingStore();

  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const createCafeMutation = useCreateCafe();

  // Debounced real-time slug check
  useEffect(() => {
    if (!slug || slug.trim().length < 3) {
      setIsSlugAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingSlug(true);
      try {
        const response = await axiosInstance.get(`/api/v1/cafes/slug/${slug}`);
        if (response.data?.data) {
          setIsSlugAvailable(false); // Cafe with slug exists -> not available
        } else {
          setIsSlugAvailable(true);
        }
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setIsSlugAvailable(true); // 404 means available
        } else {
          setIsSlugAvailable(null);
        }
      } finally {
        setIsCheckingSlug(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug, setIsSlugAvailable]);

  // Auto generate slug from cafe name if slug is untouched
  const handleCafeNameChange = (val: string) => {
    setCafeName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    setSlug(generatedSlug);
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName || !cafeName) {
      toast.error('Please enter Organization Name and Cafe Name');
      return;
    }
    setStep(2);
  };

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) {
      toast.error('Please enter a valid slug');
      return;
    }
    if (isSlugAvailable === false) {
      toast.error('Slug is already taken. Please choose another.');
      return;
    }
    setStep(3);
  };

  const handleFinalProvision = async () => {
    createCafeMutation.mutate(
      {
        org_name: orgName,
        cafe_name: cafeName,
        slug,
        timezone,
      },
      {
        onSuccess: (data) => {
          resetOnboarding();
          router.push(`/${slug}/dashboard`);
        },
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Progress Bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between text-xs font-semibold text-brand-mocha mb-3">
          <span className={step >= 1 ? 'text-brand-red font-bold' : ''}>1. Organization & Profile</span>
          <span className={step >= 2 ? 'text-brand-red font-bold' : ''}>2. URL Configuration</span>
          <span className={step >= 3 ? 'text-brand-red font-bold' : ''}>3. Provisioning & Plan</span>
        </div>
        <div className="h-2 w-full bg-brand-tan/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-red transition-all duration-300 rounded-full"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Profile */}
      {step === 1 && (
        <div className="glass p-8 rounded-3xl border border-brand-brown/10 shadow-brand-md max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-brand-red/10 text-brand-red rounded-2xl">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold font-display text-brand-brown">Organization & Cafe</h2>
              <p className="text-xs text-brand-mocha">Tell us about your brand to provision your tenant</p>
            </div>
          </div>

          <form onSubmit={handleStep1Submit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Organization Name <span className="text-brand-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Artisan Coffee Co."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Cafe Name <span className="text-brand-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Artisan Coffee Indiranagar"
                value={cafeName}
                onChange={(e) => handleCafeNameChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-brand-mocha" /> Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full cta-hero py-3.5 justify-center mt-6 text-base font-semibold"
            >
              Continue to URL Configuration
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Slug */}
      {step === 2 && (
        <div className="glass p-8 rounded-3xl border border-brand-brown/10 shadow-brand-md max-w-xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-brand-red/10 text-brand-red rounded-2xl">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold font-display text-brand-brown">Configure Cafe URL</h2>
              <p className="text-xs text-brand-mocha">This unique slug will be used for your booking portal</p>
            </div>
          </div>

          <form onSubmit={handleStep2Submit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-brand-brown mb-1.5">
                Cafe Slug <span className="text-brand-red">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. artisan-indiranagar"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isCheckingSlug ? (
                    <Loader2 className="w-5 h-5 text-brand-mocha animate-spin" />
                  ) : isSlugAvailable === true ? (
                    <Check className="w-5 h-5 text-green-600 font-bold" />
                  ) : isSlugAvailable === false ? (
                    <span className="text-xs font-bold text-red-600">Taken</span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* URL Preview */}
            <div className="p-4 rounded-2xl bg-brand-brown/5 border border-brand-brown/10 text-center">
              <span className="text-xs text-brand-mocha block mb-1">Your Public Booking Portal Preview</span>
              <span className="text-sm font-mono font-bold text-brand-red">
                https://{slug || 'your-cafe-slug'}.nextbooq.com
              </span>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 py-3 rounded-xl border border-brand-brown/20 text-brand-brown font-semibold flex items-center justify-center gap-1 hover:bg-brand-tan/40"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                type="submit"
                disabled={isSlugAvailable === false || !slug}
                className="w-2/3 cta-hero py-3 justify-center text-base font-semibold disabled:opacity-50"
              >
                Next: Select Plan
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 3: Billing & Provision */}
      {step === 3 && (
        <div className="space-y-8">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold font-display text-brand-brown mb-2">Select Your Subscription Plan</h2>
            <p className="text-sm text-brand-mocha">
              Review your details for <strong className="text-brand-brown">{cafeName}</strong> and launch your portal.
            </p>
          </div>

          <PricingCards interactive={true} />

          <div className="glass p-6 rounded-3xl border border-brand-brown/10 max-w-md mx-auto text-center shadow-brand-md">
            <div className="mb-4">
              <p className="text-xs text-brand-mocha">Submitting will provision your database and setup your dashboard.</p>
            </div>
            <button
              onClick={handleFinalProvision}
              disabled={createCafeMutation.isPending}
              className="w-full cta-hero py-4 justify-center text-lg font-bold shadow-brand-lg"
            >
              {createCafeMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Provisioning Cafe...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" /> Launch Cafe Dashboard
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
