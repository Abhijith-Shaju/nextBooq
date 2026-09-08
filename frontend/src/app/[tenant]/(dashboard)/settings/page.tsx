'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/components/providers/tenant-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';
import {
  DAY_LABELS,
  mergeOperatingHours,
  validateOperatingHoursForSubmit,
  OperatingHourEntry,
} from '@/lib/dashboard/operating-hours';
import { Save, Settings as SettingsIcon, Clock, Users, ShieldAlert, Hourglass, Loader2, CalendarClock, IndianRupee, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { StorefrontEditor } from '@/components/dashboard/storefront-editor';
import { PaymentsEditor } from '@/components/dashboard/payments-editor';
import { CafeMenuCategory } from '@/lib/types/models';

const DEFAULT_RULES = {
  default_turn_time_minutes: 90,
  max_party_size: 12,
  booking_lead_time_hours: 24,
  hold_duration_minutes: 10,
  reservation_fee: 100,
  fee_adjusted_against_bill: true,
  refund_on_cancellation: true,
  cancellation_cutoff_hours: 24,
  no_show_grace_minutes: 15,
  payment_timeout_minutes: 15,
};

export default function CafeSettingsPage() {
  const { cafe } = useTenant();
  const router = useRouter();

  const rules = cafe.reservation_rules || DEFAULT_RULES;

  const [turnTime, setTurnTime] = useState(rules.default_turn_time_minutes || 90);
  const [maxParty, setMaxParty] = useState(rules.max_party_size || 12);
  const [leadTime, setLeadTime] = useState(rules.booking_lead_time_hours || 24);
  const [holdDuration, setHoldDuration] = useState(rules.hold_duration_minutes || 10);
  const [reservationFee, setReservationFee] = useState(rules.reservation_fee || 100);
  // `??` rather than `||` throughout: these are booleans and a zero-hour
  // cutoff, all of which are legitimate values that `||` would silently
  // replace with the default.
  const [feeAdjustedAgainstBill, setFeeAdjustedAgainstBill] = useState(
    rules.fee_adjusted_against_bill ?? true
  );
  const [refundOnCancellation, setRefundOnCancellation] = useState(
    rules.refund_on_cancellation ?? true
  );
  const [cancellationCutoffHours, setCancellationCutoffHours] = useState(
    rules.cancellation_cutoff_hours ?? 24
  );
  const [noShowGraceMinutes, setNoShowGraceMinutes] = useState(
    rules.no_show_grace_minutes ?? 15
  );
  const [paymentTimeout, setPaymentTimeout] = useState(rules.payment_timeout_minutes ?? 15);
  const [gstin, setGstin] = useState(cafe.gstin || '');
  const [operatingHours, setOperatingHours] = useState<OperatingHourEntry[]>(
    mergeOperatingHours(cafe.operating_hours)
  );
  const [description, setDescription] = useState(cafe.description || '');
  const [heroImageUrl, setHeroImageUrl] = useState(cafe.hero_image_url || '');
  const [heroOverlay, setHeroOverlay] = useState(cafe.hero_overlay || 'balanced');
  const [contactPhone, setContactPhone] = useState(cafe.contact_phone || '');
  const [addressLine1, setAddressLine1] = useState(cafe.address?.line1 || '');
  const [addressLine2, setAddressLine2] = useState(cafe.address?.line2 || '');
  const [addressLandmark, setAddressLandmark] = useState(cafe.address?.landmark || '');
  const [addressCity, setAddressCity] = useState(cafe.address?.city || '');
  const [addressState, setAddressState] = useState(cafe.address?.state || '');
  const [addressPostalCode, setAddressPostalCode] = useState(cafe.address?.postal_code || '');
  const [addressMapUrl, setAddressMapUrl] = useState(cafe.address?.map_url || '');
  const [logoUrl, setLogoUrl] = useState(cafe.logo_url || '');
  const [brandPrimary, setBrandPrimary] = useState(cafe.brand_primary || '');
  const [brandAccent, setBrandAccent] = useState(cafe.brand_accent || '');
  const [menu, setMenu] = useState<CafeMenuCategory[]>(cafe.menu || []);
  const [isSaving, setIsSaving] = useState(false);
  const [webhookReveal, setWebhookReveal] = useState<{ url: string; secret: string } | null>(null);

  // `cafe` is fetched server-side (see [tenant]/layout.tsx) and only changes
  // when that server data actually refreshes (e.g. via router.refresh()
  // below) — this component doesn't necessarily unmount when that happens,
  // so without this sync the form would keep showing whatever was on screen
  // at first mount instead of picking up newly-saved values.
  const operatingHoursKey = JSON.stringify(cafe.operating_hours || []);
  const menuKey = JSON.stringify(cafe.menu || []);
  useEffect(() => {
    setTurnTime(rules.default_turn_time_minutes || 90);
    setMaxParty(rules.max_party_size || 12);
    setLeadTime(rules.booking_lead_time_hours || 24);
    setHoldDuration(rules.hold_duration_minutes || 10);
    setReservationFee(rules.reservation_fee || 100);
    setFeeAdjustedAgainstBill(rules.fee_adjusted_against_bill ?? true);
    setRefundOnCancellation(rules.refund_on_cancellation ?? true);
    setCancellationCutoffHours(rules.cancellation_cutoff_hours ?? 24);
    setNoShowGraceMinutes(rules.no_show_grace_minutes ?? 15);
    setPaymentTimeout(rules.payment_timeout_minutes ?? 15);
    setGstin(cafe.gstin || '');
    setOperatingHours(mergeOperatingHours(cafe.operating_hours));
    setDescription(cafe.description || '');
    setHeroImageUrl(cafe.hero_image_url || '');
    setHeroOverlay(cafe.hero_overlay || 'balanced');
    setContactPhone(cafe.contact_phone || '');
    setAddressLine1(cafe.address?.line1 || '');
    setAddressLine2(cafe.address?.line2 || '');
    setAddressLandmark(cafe.address?.landmark || '');
    setAddressCity(cafe.address?.city || '');
    setAddressState(cafe.address?.state || '');
    setAddressPostalCode(cafe.address?.postal_code || '');
    setAddressMapUrl(cafe.address?.map_url || '');
    setLogoUrl(cafe.logo_url || '');
    setBrandPrimary(cafe.brand_primary || '');
    setBrandAccent(cafe.brand_accent || '');
    setMenu(cafe.menu || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rules.default_turn_time_minutes,
    rules.max_party_size,
    rules.booking_lead_time_hours,
    rules.hold_duration_minutes,
    rules.reservation_fee,
    rules.fee_adjusted_against_bill,
    rules.refund_on_cancellation,
    rules.cancellation_cutoff_hours,
    rules.no_show_grace_minutes,
    rules.payment_timeout_minutes,
    cafe.gstin,
    operatingHoursKey,
    cafe.description,
    cafe.hero_image_url,
    cafe.hero_overlay,
    cafe.contact_phone,
    cafe.address?.line1,
    cafe.address?.line2,
    cafe.address?.landmark,
    cafe.address?.city,
    cafe.address?.state,
    cafe.address?.postal_code,
    cafe.address?.map_url,
    cafe.logo_url,
    cafe.brand_primary,
    cafe.brand_accent,
    menuKey,
  ]);

  const updateDay = (day: OperatingHourEntry['day_of_week'], patch: Partial<OperatingHourEntry>) => {
    setOperatingHours((prev) => prev.map((entry) => (entry.day_of_week === day ? { ...entry, ...patch } : entry)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hoursError = validateOperatingHoursForSubmit(operatingHours);
    if (hoursError) {
      toast.error(hoursError);
      return;
    }

    // Silently drop incomplete rows (e.g. a category or item the manager
    // added and then abandoned) rather than letting the backend 400 and
    // reject the entire save, including unrelated rules/hours edits.
    const menuForSubmit = menu
      .map((cat) => ({ ...cat, items: cat.items.filter((item) => item.name.trim().length > 0) }))
      .filter((cat) => cat.category.trim().length > 0 && cat.items.length > 0);

    setIsSaving(true);
    try {
      await axiosInstance.put(`/api/v1/cafes/${cafe.id}`, {
        reservation_rules: {
          default_turn_time_minutes: turnTime,
          max_party_size: maxParty,
          booking_lead_time_hours: leadTime,
          hold_duration_minutes: holdDuration,
          reservation_fee: reservationFee,
          fee_adjusted_against_bill: feeAdjustedAgainstBill,
          refund_on_cancellation: refundOnCancellation,
          cancellation_cutoff_hours: cancellationCutoffHours,
          no_show_grace_minutes: noShowGraceMinutes,
          payment_timeout_minutes: paymentTimeout,
        },
        gstin,
        operating_hours: operatingHours,
        description,
        hero_image_url: heroImageUrl,
        hero_overlay: heroOverlay,
        contact_phone: contactPhone,
        // Always send the address key, even when every field is blank —
        // that's how a cafe clears a previously-saved address. The backend
        // treats an all-blank address as "clear it" and a partial address as
        // invalid; omitting the key here would make blanking line 1 silently
        // no-op and leave the stale address live on the storefront.
        address: {
          line1: addressLine1.trim(),
          line2: addressLine2.trim(),
          landmark: addressLandmark.trim(),
          city: addressCity.trim(),
          state: addressState.trim(),
          postal_code: addressPostalCode.trim(),
          map_url: addressMapUrl.trim(),
        },
        logo_url: logoUrl,
        brand_primary: brandPrimary,
        brand_accent: brandAccent,
        menu: menuForSubmit,
      });
      // `cafe` comes from a Server Component fetch (see [tenant]/layout.tsx),
      // not react-query — router.refresh() re-runs that fetch so the rest of
      // the app (and this form, on next mount/data-change) sees the saved
      // values instead of whatever was loaded when the layout first rendered.
      router.refresh();
      toast.success('Cafe reservation rules updated successfully!');
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-brand-brown/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-red/10 text-brand-red rounded-xl flex items-center justify-center">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-brand-brown">Cafe Availability Rules</h1>
            <p className="text-xs text-brand-mochaMid mt-0.5">
              Parameters governing table slot durations, party size limits, and lead times
            </p>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-brand-brown/10">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="turn-time" className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-brand-red" /> Default Turn Time (Minutes)
              </label>
              <input
                id="turn-time"
                type="number"
                min={15}
                max={240}
                required
                value={turnTime}
                onChange={(e) => setTurnTime(parseInt(e.target.value) || 90)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
              />
              <p className="text-[11px] text-brand-mochaMid mt-1">Average dining duration allocated per booking.</p>
            </div>

            <div>
              <label htmlFor="max-party" className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-red" /> Maximum Party Size
              </label>
              <input
                id="max-party"
                type="number"
                min={1}
                max={50}
                required
                value={maxParty}
                onChange={(e) => setMaxParty(parseInt(e.target.value) || 12)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
              />
              <p className="text-[11px] text-brand-mochaMid mt-1">Highest number of guests permitted in online widget.</p>
            </div>

            <div>
              <label htmlFor="lead-time" className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-brand-red" /> Booking Lead Time (Hours)
              </label>
              <input
                id="lead-time"
                type="number"
                min={0}
                max={168}
                required
                value={leadTime}
                onChange={(e) => setLeadTime(parseInt(e.target.value) || 24)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
              />
              <p className="text-[11px] text-brand-mochaMid mt-1">Minimum hours notice required before booking.</p>
            </div>

            <div>
              <label htmlFor="hold-duration" className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Hourglass className="w-4 h-4 text-brand-red" /> Checkout Hold Duration (Minutes)
              </label>
              <input
                id="hold-duration"
                type="number"
                min={1}
                max={30}
                required
                value={holdDuration}
                onChange={(e) => setHoldDuration(parseInt(e.target.value) || 10)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
              />
              <p className="text-[11px] text-brand-mochaMid mt-1">Time allowed for customer to complete payment.</p>
            </div>

            <div>
              <label htmlFor="reservation-fee" className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <IndianRupee className="w-4 h-4 text-brand-red" /> Reservation Fee (₹)
              </label>
              <input
                id="reservation-fee"
                type="number"
                min={1}
                max={100000}
                step={0.01}
                required
                value={reservationFee}
                onChange={(e) => setReservationFee(parseFloat(e.target.value) || 100)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
              />
              <p className="text-[11px] text-brand-mochaMid mt-1">Charged to the customer via Razorpay to confirm each booking.</p>
            </div>
          </div>

          {/* Fee terms. These are shown to the guest before they pay and are
              recorded on each booking, so changing them here affects future
              bookings only -- existing ones keep the terms they were made
              under. */}
          <div className="pt-6 border-t border-brand-brown/10">
            <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
              <IndianRupee className="w-4 h-4 text-brand-red" /> Fee and Refund Policy
            </h2>
            <p className="text-xs text-brand-mochaMid mb-4">
              How the reservation fee behaves once collected. Guests see this before paying, and
              it is recorded on each booking &mdash; changes apply to new bookings only.
            </p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 rounded-xl border border-brand-brown/15 bg-white cursor-pointer hover:bg-brand-tan/20 transition-colors">
                <input
                  type="checkbox"
                  checked={feeAdjustedAgainstBill}
                  onChange={(e) => setFeeAdjustedAgainstBill(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-red shrink-0"
                />
                <span>
                  <span className="block text-sm font-semibold text-brand-brown">
                    Deduct the fee from the final bill
                  </span>
                  <span className="block text-[11px] text-brand-mochaMid mt-0.5">
                    {feeAdjustedAgainstBill
                      ? 'The guest pays ₹' + reservationFee + ' now and it comes off what they pay at the table.'
                      : 'The fee is billed separately and does not reduce the guest’s bill at the table.'}
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-brand-brown/15 bg-white cursor-pointer hover:bg-brand-tan/20 transition-colors">
                <input
                  type="checkbox"
                  checked={refundOnCancellation}
                  onChange={(e) => setRefundOnCancellation(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-brand-red shrink-0"
                />
                <span>
                  <span className="block text-sm font-semibold text-brand-brown">
                    Refund the fee if a guest cancels in time
                  </span>
                  <span className="block text-[11px] text-brand-mochaMid mt-0.5">
                    {refundOnCancellation
                      ? 'A guest who cancels before the cut-off below gets the fee back.'
                      : 'The fee is non-refundable. Guests are told this before they pay.'}
                  </span>
                </span>
              </label>

              <div className={refundOnCancellation ? '' : 'opacity-50'}>
                <label
                  htmlFor="cancellation-cutoff"
                  className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5"
                >
                  <CalendarClock className="w-4 h-4 text-brand-red" /> Cancellation cut-off (hours)
                </label>
                <input
                  id="cancellation-cutoff"
                  type="number"
                  min={0}
                  max={720}
                  step={1}
                  disabled={!refundOnCancellation}
                  value={cancellationCutoffHours}
                  onChange={(e) => setCancellationCutoffHours(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums disabled:bg-brand-tan/20 disabled:cursor-not-allowed"
                />
                <p className="text-[11px] text-brand-mochaMid mt-1">
                  How long before the booking a guest must cancel to get the fee back. Your staff
                  apply this when cancelling from the dashboard &mdash; nextBooq does not block a
                  late cancellation automatically.
                </p>
              </div>

              <div>
                <label
                  htmlFor="no-show-grace"
                  className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5"
                >
                  <Clock className="w-4 h-4 text-brand-red" /> No-show grace period (minutes)
                </label>
                <input
                  id="no-show-grace"
                  type="number"
                  min={0}
                  max={240}
                  step={1}
                  value={noShowGraceMinutes}
                  onChange={(e) => setNoShowGraceMinutes(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
                />
                <p className="text-[11px] text-brand-mochaMid mt-1">
                  How late a guest may arrive before the booking counts as a no-show. Shown to
                  guests before they pay, because it is the stated basis for keeping the fee.
                </p>
              </div>

              <div>
                <label
                  htmlFor="payment-timeout"
                  className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5"
                >
                  <Clock className="w-4 h-4 text-brand-red" /> Payment window (minutes)
                </label>
                <input
                  id="payment-timeout"
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={paymentTimeout}
                  onChange={(e) => setPaymentTimeout(parseInt(e.target.value) || 15)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
                />
                <p className="text-[11px] text-brand-mochaMid mt-1">
                  How long a booking waits for payment before the table is released. This is the
                  deadline actually enforced.
                </p>
              </div>

              <div>
                <label
                  htmlFor="cafe-gstin"
                  className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5"
                >
                  <IndianRupee className="w-4 h-4 text-brand-red" /> GSTIN
                </label>
                <input
                  id="cafe-gstin"
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5"
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tracking-wide"
                />
                <p className="text-[11px] text-brand-mochaMid mt-1">
                  Shown on your storefront as part of your business details. Leave blank if your
                  business is not GST-registered.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-brand-brown/10">
            <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-brand-red" /> Operating Hours
            </h2>
            <p className="text-[11px] text-brand-mochaMid mb-3">
              Bookings outside these hours are rejected. Mark a day closed to block it entirely.
            </p>
            <div className="space-y-2">
              {operatingHours.map((entry) => (
                <div
                  key={entry.day_of_week}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-brown/10 bg-white px-4 py-2.5"
                >
                  <span className="w-24 text-sm font-semibold text-brand-brown">
                    {DAY_LABELS[entry.day_of_week]}
                  </span>

                  <label className="flex items-center gap-1.5 text-xs text-brand-mochaMid">
                    <input
                      type="checkbox"
                      checked={entry.is_closed}
                      onChange={(e) => updateDay(entry.day_of_week, { is_closed: e.target.checked })}
                      aria-label={`${DAY_LABELS[entry.day_of_week]} closed`}
                    />
                    Closed
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-brand-mochaMid">
                    Open
                    <input
                      type="time"
                      value={entry.open_time}
                      disabled={entry.is_closed}
                      onChange={(e) => updateDay(entry.day_of_week, { open_time: e.target.value })}
                      aria-label={`${DAY_LABELS[entry.day_of_week]} opening time`}
                      className="rounded-lg border border-brand-brown/20 bg-white px-2 py-1 font-mono text-xs disabled:opacity-40"
                    />
                  </label>

                  <label className="flex items-center gap-1.5 text-xs text-brand-mochaMid">
                    Close
                    <input
                      type="time"
                      value={entry.close_time}
                      disabled={entry.is_closed}
                      onChange={(e) => updateDay(entry.day_of_week, { close_time: e.target.value })}
                      aria-label={`${DAY_LABELS[entry.day_of_week]} closing time`}
                      className="rounded-lg border border-brand-brown/20 bg-white px-2 py-1 font-mono text-xs disabled:opacity-40"
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-brand-brown/10 space-y-4">
            {/* Grouped so the space-y-4 gap does not push between the heading
                and its description. They were siblings with a negative margin
                cancelling that gap, which overshot into a negative gap and
                crowded the description up into the heading. */}
            <div>
              <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-brand-red" /> Address
              </h2>
              <p className="text-[11px] text-brand-mochaMid">
                Where guests will find you. Fill in line 1 to save an address.
              </p>
            </div>

            <div>
              <label htmlFor="address-line1" className="block text-sm font-semibold text-brand-brown mb-1.5">
                Address Line 1
              </label>
              <input
                id="address-line1"
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="12 Church Street"
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
              />
            </div>

            <div>
              <label htmlFor="address-line2" className="block text-sm font-semibold text-brand-brown mb-1.5">
                Address Line 2 (optional)
              </label>
              <input
                id="address-line2"
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
              />
            </div>

            <div>
              <label htmlFor="address-landmark" className="block text-sm font-semibold text-brand-brown mb-1.5">
                Landmark (optional)
              </label>
              <input
                id="address-landmark"
                type="text"
                value={addressLandmark}
                onChange={(e) => setAddressLandmark(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="address-city" className="block text-sm font-semibold text-brand-brown mb-1.5">
                  City
                </label>
                <input
                  id="address-city"
                  type="text"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
                />
              </div>

              <div>
                <label htmlFor="address-state" className="block text-sm font-semibold text-brand-brown mb-1.5">
                  State
                </label>
                <input
                  id="address-state"
                  type="text"
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
                />
              </div>

              <div>
                <label htmlFor="address-postal-code" className="block text-sm font-semibold text-brand-brown mb-1.5">
                  PIN Code
                </label>
                <input
                  id="address-postal-code"
                  type="text"
                  value={addressPostalCode}
                  onChange={(e) => setAddressPostalCode(e.target.value)}
                  placeholder="560001"
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono"
                />
              </div>

              <div>
                <label htmlFor="address-map-url" className="block text-sm font-semibold text-brand-brown mb-1.5">
                  Map link (optional)
                </label>
                <input
                  id="address-map-url"
                  type="text"
                  value={addressMapUrl}
                  onChange={(e) => setAddressMapUrl(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
                />
                <p className="text-[11px] text-brand-mochaMid mt-1">
                  Shown on your storefront so guests can find you.
                </p>
              </div>
            </div>
          </div>

          <StorefrontEditor
            description={description}
            heroImageUrl={heroImageUrl}
            heroOverlay={heroOverlay}
            contactPhone={contactPhone}
            logoUrl={logoUrl}
            brandPrimary={brandPrimary}
            brandAccent={brandAccent}
            menu={menu}
            onDescriptionChange={setDescription}
            onHeroImageUrlChange={setHeroImageUrl}
            onHeroOverlayChange={setHeroOverlay}
            onContactPhoneChange={setContactPhone}
            onLogoUrlChange={setLogoUrl}
            onBrandPrimaryChange={setBrandPrimary}
            onBrandAccentChange={setBrandAccent}
            onMenuChange={setMenu}
          />

          <PaymentsEditor
            cafeId={cafe.id}
            razorpayKeyId={cafe.payments?.razorpay_key_id || ''}
            configured={cafe.payments?.configured || false}
            onSaved={(webhook) => {
              setWebhookReveal(webhook);
              router.refresh();
              toast.success('Razorpay connected. Copy the webhook details below into your Razorpay dashboard now — they won\'t be shown again.');
            }}
          />

          {webhookReveal && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
              <p className="font-semibold">Add this webhook in your Razorpay dashboard (Settings → Webhooks):</p>
              <p>
                URL: <span className="font-mono">{webhookReveal.url}</span>
              </p>
              <p>
                Secret: <span className="font-mono">{webhookReveal.secret}</span>
              </p>
              {/* The events matter as much as the URL and are easy to miss in
                  Razorpay's long list of tick boxes. Without payment.failed an
                  abandoned checkout is never reconciled. */}
              <p>
                Events: <span className="font-mono">payment.captured</span> and{' '}
                <span className="font-mono">payment.failed</span>
              </p>
              {/* A wrong URL returns 404 to Razorpay and nothing at all to us,
                  so the only way anyone finds out is by looking at Razorpay's
                  delivery log. The guide says to do that. */}
              <p className="pt-1">
                <a
                  href="/help/razorpay-setup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-2"
                >
                  Setup guide — including how to check it actually worked
                </a>
              </p>
            </div>
          )}

          <div className="pt-6 border-t border-brand-brown/10 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="btn-action py-3 px-8 text-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving Rules...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-1" /> Save Cafe Rules
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
