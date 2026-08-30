'use client';

import Link from 'next/link';
import { useState } from 'react';
import { format } from 'date-fns';
import type { SubscriptionTermMonths } from '@/lib/types/models';
import { useOwnerLookup } from '@/hooks/admin/use-owner-lookup';
import { useProvisionCafe } from '@/hooks/admin/use-provision-cafe';
import type { ProvisionCafePayload, ProvisionCafeResult } from '@/lib/types/admin-onboarding';
import { apiMessage } from '@/lib/api-message';

export const TERM_OPTIONS: Array<{ value: SubscriptionTermMonths; label: string; defaultPrice: number }> = [
  { value: 1, label: 'Monthly', defaultPrice: 9000 },
  { value: 6, label: '6 months', defaultPrice: 8000 },
  { value: 12, label: '12 months', defaultPrice: 7000 },
  { value: 18, label: '18 months', defaultPrice: 6000 },
];

const INDIAN_PIN_PATTERN = /^[1-9][0-9]{5}$/;

export function CafeOnboardingForm() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [lookupRequested, setLookupRequested] = useState(false);
  const ownerLookup = useOwnerLookup(ownerEmail, lookupRequested);
  const provision = useProvisionCafe();
  const [organizationMode, setOrganizationMode] = useState<'new' | 'existing'>('new');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [cafeName, setCafeName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'trial'>('active');
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(12);
  const [pricePerMonth, setPricePerMonth] = useState(7000);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ProvisionCafeResult | null>(null);

  const pinError =
    postalCode && !INDIAN_PIN_PATTERN.test(postalCode) ? 'Enter a valid 6-digit Indian PIN code.' : '';

  const reset = () => {
    setStep(1);
    setOwnerEmail(''); setLookupRequested(false); setOrganizationMode('new'); setOrganizationName(''); setOrganizationId('');
    setCafeName(''); setSlug(''); setTimezone('Asia/Kolkata');
    setLine1(''); setLine2(''); setLandmark(''); setCity(''); setAddressState(''); setPostalCode(''); setMapUrl('');
    setSubscriptionStatus('active'); setTermMonths(12); setPricePerMonth(7000); setNote(''); setResult(null);
  };

  const onLookup = (event: React.FormEvent) => {
    event.preventDefault();
    setLookupRequested(false);
    queueMicrotask(() => setLookupRequested(true));
  };

  const onSubscriptionStatusChange = (value: 'active' | 'trial') => {
    setSubscriptionStatus(value);
    if (value === 'trial') { setTermMonths(1); setPricePerMonth(0); }
  };

  const onTermChange = (value: SubscriptionTermMonths) => {
    setTermMonths(value);
    setPricePerMonth(TERM_OPTIONS.find((item) => item.value === value)?.defaultPrice ?? 0);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (step !== 6 || !ownerLookup.data) return;
    const payload: ProvisionCafePayload = {
      owner_user_id: ownerLookup.data.id,
      organization: organizationMode === 'new'
        ? { mode: 'new', name: organizationName.trim() }
        : { mode: 'existing', id: organizationId },
      cafe: {
        name: cafeName.trim(),
        slug: slug.trim().toLowerCase(),
        timezone: timezone.trim(),
        address: {
          line1: line1.trim(),
          line2: line2.trim(),
          landmark: landmark.trim(),
          city: city.trim(),
          state: addressState.trim(),
          postal_code: postalCode.trim(),
          map_url: mapUrl.trim(),
        },
      },
      subscription: subscriptionStatus === 'trial'
        ? { status: 'trial', term_months: 1, price_per_month: 0, note: note.trim() || undefined }
        : { status: 'active', term_months: termMonths, price_per_month: Number(pricePerMonth), note: note.trim() || undefined },
    };
    provision.mutate(payload, { onSuccess: setResult });
  };

  if (result) {
    const trial = result.subscription.status === 'trial';
    return (
      <section className="max-w-2xl rounded-xl border border-emerald-200 bg-white p-6 shadow-sm" aria-live="polite">
        <p className="text-sm font-semibold text-emerald-700">Cafe onboarded successfully</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">{result.cafe.name}</h2>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Owner</dt><dd className="font-medium">{result.owner.name} · {result.owner.email}</dd></div>
          <div><dt className="text-slate-500">Organization</dt><dd className="font-medium">{result.organization.name}</dd></div>
          <div><dt className="text-slate-500">Cafe slug</dt><dd className="font-medium">/{result.cafe.slug}</dd></div>
          <div><dt className="text-slate-500">Subscription</dt><dd className="font-medium">{trial ? 'One-month trial at ₹0' : `${result.subscription.term_months} months · ₹${result.subscription.price_per_month}/month`} · {result.subscription.status}</dd></div>
          <div><dt className="text-slate-500">Starts</dt><dd className="font-medium">{format(new Date(result.subscription.period_start), 'MMM d, yyyy')}</dd></div>
          <div><dt className="text-slate-500">Ends</dt><dd className="font-medium">{format(new Date(result.subscription.current_period_end), 'MMM d, yyyy')}</dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/${result.cafe.slug}`} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">View Cafe Page</Link>
          <Link href={`/admin?cafeId=${encodeURIComponent(result.cafe.id)}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">View in Admin</Link>
          <button type="button" onClick={reset} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Onboard Another</button>
        </div>
      </section>
    );
  }

  const owner = ownerLookup.data;
  const canSubmit = !!owner && cafeName.trim() && slug.trim() && timezone.trim() &&
    (organizationMode === 'new' ? organizationName.trim() : organizationId) && !provision.isPending;
  const canContinue = step === 1
    ? !!owner
    : step === 2
      ? organizationMode === 'new' ? !!organizationName.trim() : !!organizationId
      : step === 3
        ? !!cafeName.trim() && !!slug.trim() && !!timezone.trim()
        : step === 4
          ? !!line1.trim() && !!city.trim() && !!addressState.trim() && !!postalCode.trim() && !pinError
          : true;

  const next = () => {
    if (!canContinue || step === 6) return;
    setStep((current) => (current + 1) as 1 | 2 | 3 | 4 | 5 | 6);
  };

  const back = () => {
    if (step === 1) return;
    setStep((current) => (current - 1) as 1 | 2 | 3 | 4 | 5 | 6);
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div><h2 className="text-xl font-bold">Onboard cafe</h2><p className="mt-1 text-sm text-slate-600">Create a cafe and its initial subscription for an existing account owner.</p></div>
      {step === 1 && <section className="space-y-3 border-t border-slate-100 pt-5"><h3 className="font-semibold">1. Find owner</h3>
        <div className="flex gap-2"><input aria-label="Owner email" type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="owner@example.com" required className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="button" onClick={onLookup} disabled={!ownerEmail.trim() || ownerLookup.isFetching} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{ownerLookup.isFetching ? 'Finding…' : 'Find owner'}</button></div>
        {owner && <p className="text-sm text-emerald-700">Owner found: {owner.name} ({owner.email})</p>}
        {lookupRequested && ownerLookup.isError && <p className="text-sm text-red-700">{apiMessage(ownerLookup.error, 'Unable to complete cafe onboarding.')} Ask the person to register before onboarding a cafe.</p>}
      </section>}
      {step === 2 && owner && <section className="space-y-3 border-t border-slate-100 pt-5"><h3 className="font-semibold">2. Organization</h3>
          <div className="flex gap-5 text-sm"><label><input type="radio" checked={organizationMode === 'new'} onChange={() => setOrganizationMode('new')} /> New organization</label>
            <label><input type="radio" checked={organizationMode === 'existing'} onChange={() => setOrganizationMode('existing')} disabled={!owner.owned_organizations.length} /> Existing owned organization</label></div>
          {organizationMode === 'new' ? <input aria-label="Organization name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Organization name" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /> :
            <select aria-label="Owned organization" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="">Select organization</option>{owner.owned_organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select>}
      </section>}
      {step === 3 && owner && <section className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2"><h3 className="col-span-full font-semibold">3. Cafe details</h3>
        <input aria-label="Cafe name" value={cafeName} onChange={(event) => setCafeName(event.target.value)} placeholder="Cafe name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input aria-label="Cafe slug" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="cafe-slug" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input aria-label="Cafe timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </section>}
      {step === 4 && owner && <section className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2"><h3 className="col-span-full font-semibold">4. Address</h3>
        <input aria-label="Address line 1" value={line1} onChange={(event) => setLine1(event.target.value)} placeholder="12 Church Street" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
        <input aria-label="Address line 2" value={line2} onChange={(event) => setLine2(event.target.value)} placeholder="Address line 2 (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
        <input aria-label="Landmark" value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="Landmark (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
        <input aria-label="City" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Bengaluru" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input aria-label="State" value={addressState} onChange={(event) => setAddressState(event.target.value)} placeholder="Karnataka" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <div>
          <input aria-label="PIN code" value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="560001" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          {pinError && <p className="mt-1.5 text-xs text-red-700">{pinError}</p>}
        </div>
        <input aria-label="Map link" value={mapUrl} onChange={(event) => setMapUrl(event.target.value)} placeholder="https://maps.google.com/… (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </section>}
      {step === 5 && owner && <section className="space-y-3 border-t border-slate-100 pt-5"><h3 className="font-semibold">5. Initial subscription</h3>
          <div className="flex gap-5 text-sm"><label><input type="radio" checked={subscriptionStatus === 'active'} onChange={() => onSubscriptionStatusChange('active')} /> Active</label><label><input type="radio" checked={subscriptionStatus === 'trial'} onChange={() => onSubscriptionStatusChange('trial')} /> One-month trial at ₹0</label></div>
          {subscriptionStatus === 'active' && <div className="grid gap-3 sm:grid-cols-2"><select aria-label="Term months" value={termMonths} onChange={(event) => onTermChange(Number(event.target.value) as SubscriptionTermMonths)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">{TERM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><input aria-label="Price per month" type="number" min={0} value={pricePerMonth} onChange={(event) => setPricePerMonth(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>}
          <input aria-label="Subscription note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional admin note" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </section>}
      {step === 6 && owner && <section className="border-t border-slate-100 pt-5"><h3 className="font-semibold">6. Review</h3><p className="mt-1 text-sm text-slate-600">This assigns {owner.name} as the owner and creates the cafe, subscription, and organization atomically.</p>
          {provision.isError && <p className="mt-3 text-sm text-red-700">{apiMessage(provision.error, 'Unable to complete cafe onboarding.')}</p>}
          <button type="submit" disabled={!canSubmit} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{provision.isPending ? 'Provisioning…' : 'Confirm and onboard cafe'}</button>
      </section>}
      {!result && step < 6 && <div className="flex justify-between border-t border-slate-100 pt-5">
        {step > 1 ? <button type="button" onClick={back} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Back</button> : <span />}
        <button type="button" onClick={next} disabled={!canContinue} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue</button>
      </div>}
    </form>
  );
}
