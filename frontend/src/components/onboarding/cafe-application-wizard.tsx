'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Coffee, Loader2, XCircle } from 'lucide-react';
import { useSubmitCafeApplication } from '@/hooks/onboarding/use-submit-cafe-application';
import { useMyCafeApplication } from '@/hooks/onboarding/use-my-cafe-application';
import { useSlugAvailability } from '@/hooks/onboarding/use-slug-availability';
import type { CafeApplicationPayload } from '@/lib/types/cafe-application';
import { apiMessage } from '@/lib/api-message';

const INDIAN_PIN_PATTERN = /^[1-9][0-9]{5}$/;

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white/80 focus:bg-white focus:ring-2 focus:ring-brand-red focus:outline-none transition-all text-sm';
const labelClass = 'block text-sm font-semibold text-brand-brown mb-1.5';

// A single sitting's worth of typing — sessionStorage (not localStorage) so
// it clears itself when the tab/browser closes rather than lingering on a
// shared machine, and survives a mid-form refresh, which plain useState does
// not.
const DRAFT_STORAGE_KEY = 'nextbooq:onboarding:cafe-application-draft';

interface CafeApplicationDraft {
  step?: 1 | 2 | 3 | 4;
  organizationName?: string;
  cafeName?: string;
  slug?: string;
  timezone?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  mapUrl?: string;
}

// Wrapped in try/catch: private browsing, blocked site data, or a disabled
// storage API must degrade to "no draft" rather than break the form.
function readDraft(): CafeApplicationDraft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraft(draft: CafeApplicationDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable or full — the in-memory form state still works,
    // it just won't survive a refresh this time.
  }
}

function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to do — see readDraft/writeDraft.
  }
}

export function CafeApplicationWizard() {
  const router = useRouter();
  const submitApplication = useSubmitCafeApplication();
  const { data: existingApplication, isLoading: isApplicationLoading } = useMyCafeApplication();

  // A pending or approved application already occupies this account — reapplying
  // would either duplicate a submission still under review or attempt to
  // re-provision an already-live cafe (the backend's loadPending rejects that
  // with a 409 anyway, but surfacing it after a 4-step form is a dead end,
  // not a guard). Rejected and withdrawn are terminal-but-reapplicable
  // states — see getCafeApplicationCardState, which maps both to "apply".
  const blockedByExistingApplication =
    !!existingApplication &&
    (existingApplication.status === 'pending' || existingApplication.status === 'approved');

  useEffect(() => {
    if (isApplicationLoading) return;
    if (blockedByExistingApplication) {
      router.replace('/onboarding/status');
    }
  }, [isApplicationLoading, blockedByExistingApplication, router]);

  // Read once, at construction, not on every render — the draft only ever
  // needs to seed initial state.
  const initialDraftRef = useRef<CafeApplicationDraft | null>(null);
  if (initialDraftRef.current === null) {
    initialDraftRef.current = readDraft();
  }
  const initialDraft = initialDraftRef.current;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialDraft.step ?? 1);

  const [organizationName, setOrganizationName] = useState(initialDraft.organizationName ?? '');

  const [cafeName, setCafeName] = useState(initialDraft.cafeName ?? '');
  const [slug, setSlug] = useState(initialDraft.slug ?? '');
  // Debounced copy of slug fed to the availability hook — avoids a request on
  // every keystroke while the user is still typing.
  const [debouncedSlug, setDebouncedSlug] = useState(initialDraft.slug ?? '');
  const [timezone, setTimezone] = useState(initialDraft.timezone ?? 'Asia/Kolkata');

  const [line1, setLine1] = useState(initialDraft.line1 ?? '');
  const [line2, setLine2] = useState(initialDraft.line2 ?? '');
  const [landmark, setLandmark] = useState(initialDraft.landmark ?? '');
  const [city, setCity] = useState(initialDraft.city ?? '');
  const [state, setState] = useState(initialDraft.state ?? '');
  const [postalCode, setPostalCode] = useState(initialDraft.postalCode ?? '');
  const [mapUrl, setMapUrl] = useState(initialDraft.mapUrl ?? '');

  // Persist on every change so a refresh mid-step never loses what was
  // already typed.
  useEffect(() => {
    writeDraft({
      step,
      organizationName,
      cafeName,
      slug,
      timezone,
      line1,
      line2,
      landmark,
      city,
      state,
      postalCode,
      mapUrl,
    });
  }, [step, organizationName, cafeName, slug, timezone, line1, line2, landmark, city, state, postalCode, mapUrl]);

  // Debounce: update debouncedSlug 400 ms after the user stops typing.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSlug(slug), 400);
    return () => clearTimeout(id);
  }, [slug]);

  const slugAvailability = useSlugAvailability(debouncedSlug);

  const pinError =
    postalCode && !INDIAN_PIN_PATTERN.test(postalCode)
      ? 'Enter a valid 6-digit Indian PIN code.'
      : '';

  const canContinue =
    step === 1
      ? !!organizationName.trim()
      : step === 2
        ? !!cafeName.trim() &&
          !!slug.trim() &&
          !!timezone.trim() &&
          slugAvailability === 'available'
        : step === 3
          ? !!line1.trim() && !!city.trim() && !!state.trim() && !!postalCode.trim() && !pinError
          : true;

  const next = () => {
    if (!canContinue || step === 4) return;
    setStep((current) => (current + 1) as 1 | 2 | 3 | 4);
  };

  const back = () => {
    if (step === 1) return;
    setStep((current) => (current - 1) as 1 | 2 | 3 | 4);
  };

  const submit = () => {
    if (submitApplication.isPending) return;
    const payload: CafeApplicationPayload = {
      organization_name: organizationName.trim(),
      cafe_name: cafeName.trim(),
      cafe_slug: slug.trim().toLowerCase(),
      timezone: timezone.trim(),
      address: {
        line1: line1.trim(),
        line2: line2.trim(),
        landmark: landmark.trim(),
        city: city.trim(),
        state: state.trim(),
        postal_code: postalCode.trim(),
        map_url: mapUrl.trim(),
      },
    };
    submitApplication.mutate(payload, {
      onSuccess: () => {
        clearDraft();
        router.push('/onboarding/status');
      },
    });
  };

  // Don't flash the empty form for a legitimate first-time applicant while
  // the precondition check is still in flight, and don't render it at all
  // for someone the effect above is about to redirect away.
  if (isApplicationLoading || blockedByExistingApplication) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 pb-12 pt-24 md:pt-28">
        <Loader2 className="w-6 h-6 animate-spin text-brand-mocha" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4 pb-12 pt-24 md:pt-28">
      <div className="max-w-xl w-full space-y-8">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center shadow-brand-md">
            <Coffee className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-2xl text-brand-brown">
            next<span className="text-brand-red">Booq</span>
          </span>
        </div>

        <div className="glass rounded-3xl p-8 space-y-6 shadow-brand-md border border-brand-brown/10">
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold text-brand-brown">Tell us about your cafe</h1>
            <p className="font-sans text-brand-mocha text-sm mt-1">
              Step {step} of 4
            </p>
          </div>

          <div className="space-y-4 text-left">
            {step === 1 && (
              <div>
                <label htmlFor="organization-name" className={labelClass}>
                  Organization name
                </label>
                <input
                  id="organization-name"
                  type="text"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Filter Kaapi Co"
                  className={inputClass}
                />
              </div>
            )}

            {step === 2 && (
              <>
                <div>
                  <label htmlFor="cafe-name" className={labelClass}>
                    Cafe name
                  </label>
                  <input
                    id="cafe-name"
                    type="text"
                    value={cafeName}
                    onChange={(event) => setCafeName(event.target.value)}
                    placeholder="Filter Kaapi"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="cafe-slug" className={labelClass}>
                    Cafe address on nextBooq
                  </label>
                  <input
                    id="cafe-slug"
                    type="text"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="filter-kaapi"
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-brand-mocha font-mono">
                    nextbooq.in/{slug || 'your-cafe'}
                  </p>
                  {/* Inline availability indicator — only shown once the user
                      has typed enough characters to be worth checking. */}
                  {slugAvailability === 'checking' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-brand-mocha">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Checking availability…
                    </p>
                  )}
                  {slugAvailability === 'available' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Available
                    </p>
                  )}
                  {slugAvailability === 'taken' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-brand-red font-medium">
                      <XCircle className="w-3.5 h-3.5" />
                      Already taken — please choose a different address
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="cafe-timezone" className={labelClass}>
                    Timezone
                  </label>
                  <input
                    id="cafe-timezone"
                    type="text"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder="Asia/Kolkata"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label htmlFor="address-line1" className={labelClass}>
                    Address line 1
                  </label>
                  <input
                    id="address-line1"
                    type="text"
                    value={line1}
                    onChange={(event) => setLine1(event.target.value)}
                    placeholder="12 Church Street"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="address-line2" className={labelClass}>
                    Address line 2 (optional)
                  </label>
                  <input
                    id="address-line2"
                    type="text"
                    value={line2}
                    onChange={(event) => setLine2(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="landmark" className={labelClass}>
                    Landmark (optional)
                  </label>
                  <input
                    id="landmark"
                    type="text"
                    value={landmark}
                    onChange={(event) => setLandmark(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="city" className={labelClass}>
                      City
                    </label>
                    <input
                      id="city"
                      type="text"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="Bengaluru"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="state" className={labelClass}>
                      State
                    </label>
                    <input
                      id="state"
                      type="text"
                      value={state}
                      onChange={(event) => setState(event.target.value)}
                      placeholder="Karnataka"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="postal-code" className={labelClass}>
                    PIN code
                  </label>
                  <input
                    id="postal-code"
                    type="text"
                    inputMode="numeric"
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    placeholder="560001"
                    className={inputClass}
                  />
                  {pinError && <p className="mt-1.5 text-xs text-brand-red">{pinError}</p>}
                </div>
                <div>
                  <label htmlFor="map-url" className={labelClass}>
                    Map link (optional)
                  </label>
                  <input
                    id="map-url"
                    type="text"
                    value={mapUrl}
                    onChange={(event) => setMapUrl(event.target.value)}
                    placeholder="https://maps.google.com/…"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="font-display text-lg font-bold text-brand-brown">Review your application</h2>
                <dl className="space-y-2 text-sm">
                  <div><dt className="text-brand-mocha">Organization</dt><dd className="font-medium text-brand-brown">{organizationName}</dd></div>
                  <div><dt className="text-brand-mocha">Cafe name</dt><dd className="font-medium text-brand-brown">{cafeName}</dd></div>
                  <div><dt className="text-brand-mocha">Cafe address</dt><dd className="font-medium text-brand-brown font-mono">nextbooq.in/{slug}</dd></div>
                  <div><dt className="text-brand-mocha">Timezone</dt><dd className="font-medium text-brand-brown">{timezone}</dd></div>
                  <div>
                    <dt className="text-brand-mocha">Address</dt>
                    <dd className="font-medium text-brand-brown">
                      {[line1, line2, landmark, city, state, postalCode].filter(Boolean).join(', ')}
                    </dd>
                  </div>
                </dl>
                {submitApplication.isError && (
                  <p className="text-sm text-brand-red">{apiMessage(submitApplication.error, 'Unable to submit your application.')}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={back}
                className="rounded-xl border border-brand-brown/20 px-4 py-2.5 text-sm font-semibold text-brand-brown hover:bg-white transition-colors"
              >
                Back
              </button>
            ) : (
              <span />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canContinue}
                className="cta-hero px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitApplication.isPending}
                className="cta-hero px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitApplication.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…
                  </>
                ) : (
                  'Submit Application'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
