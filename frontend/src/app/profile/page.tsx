'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Users,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useOrganization } from '@/hooks/org/use-organization';
import { useOrgCafes } from '@/hooks/org/use-org-cafes';
import { useCustomerReservations } from '@/hooks/customer/use-customer-reservations';
import { useMyCafeApplication } from '@/hooks/onboarding/use-my-cafe-application';
import { useResendVerificationEmail } from '@/hooks/auth/use-resend-verification-email';
import { useChangeEmail } from '@/hooks/auth/use-change-email';
import { useChangePhone } from '@/hooks/auth/use-change-phone';
import { useChangeName } from '@/hooks/auth/use-change-name';
import { useRequestStepUpOtp } from '@/hooks/auth/use-request-step-up-otp';
import { ChangeCredentialForm } from '@/components/auth/change-credential-form';
import { useBookingStore } from '@/store/use-booking-store';
import { StatusBadge } from '@/components/shared/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getManagerCafes, getProfileRole, PROFILE_ROLE_LABELS } from '@/lib/profile/user-workspace';
import { CafeApplicationCard } from '@/components/profile/cafe-application-card';
import { Reservation } from '@/lib/types/models';
import { toast } from 'sonner';

type EditField = 'email' | 'phone' | 'name' | null;

const SUBSCRIPTION_STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  trial: 'border-blue-200 bg-blue-100 text-blue-800',
  past_due: 'border-amber-200 bg-amber-100 text-amber-800',
  inactive: 'border-brand-tan bg-brand-tan/60 text-brand-mocha',
};

function subscriptionStyle(status: string): string {
  return SUBSCRIPTION_STATUS_STYLES[status] ?? 'border-brand-tan bg-brand-tan/60 text-brand-mocha';
}

function reservationCafe(res: Reservation): { name: string; slug: string } | null {
  return typeof res.cafe_id === 'object' ? res.cafe_id : null;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const { setReservation, setPartySize, setDate, setTime, setHoldExpiresAt } = useBookingStore();

  const role = getProfileRole(user);
  const isOwner = role === 'owner';

  const { data: organization, isLoading: isOrgLoading } = useOrganization(isOwner);
  const { data: ownedCafes = [], isLoading: isCafesLoading } = useOrgCafes(isOwner);
  const { data: reservations = [], isLoading: isReservationsLoading } = useCustomerReservations(!!user);
  const { data: cafeApplication } = useMyCafeApplication(!!user);
  const resendVerification = useResendVerificationEmail();
  const changeEmail = useChangeEmail();
  const changePhone = useChangePhone();
  const changeName = useChangeName();
  const requestStepUpOtp = useRequestStepUpOtp();
  const [editing, setEditing] = useState<EditField>(null);
  const [nameDraft, setNameDraft] = useState('');

  if (!user) {
    return null;
  }

  const managerCafes = getManagerCafes(user);
  const showCafesSection = role === 'owner' || role === 'manager';
  const memberSince = user.created_at ? format(new Date(user.created_at), 'MMMM yyyy') : null;

  const handleResendVerification = () => {
    resendVerification.mutate(undefined, {
      onSuccess: () => toast.success("We've sent a new verification email."),
      onError: () => toast.error('Could not send the verification email. Please try again.'),
    });
  };

  const handleChangeEmail = (newEmail: string, currentPassword: string, otpCode: string) => {
    changeEmail.mutate(
      // otpCode is only meaningful (and only checked by the backend) once
      // the current email is already verified — the unverified-account
      // recovery path doesn't send it at all.
      { newEmail, currentPassword, ...(user.is_email_verified ? { otpCode } : {}) },
      {
        onSuccess: () => {
          setEditing(null);
          router.push(`/auth/verify-email?callbackUrl=${encodeURIComponent('/profile')}&source=email-change`);
        },
      }
    );
  };

  const handleRequestStepUpOtp = () => {
    requestStepUpOtp.mutate(undefined, {
      onSuccess: () => toast.success('A security code has been sent to your email.'),
      onError: () => toast.error('Could not send the security code. Please try again.'),
    });
  };

  const handleChangePhone = (newPhone: string, currentPassword: string) => {
    changePhone.mutate(
      { newPhone, currentPassword },
      {
        onSuccess: () => {
          setEditing(null);
          toast.success('Phone number updated.');
        },
      }
    );
  };

  const resumePayment = (res: Reservation) => {
    const cafe = reservationCafe(res);
    if (!cafe) return;

    const resId = String(res._id || res.id || '');
    const expiresAt = res.payment_data?.expires_at;

    setReservation({
      id: resId,
      status: res.status,
      razorpay_order_id: res.payment_data?.order_id || '',
      amount: res.payment_data?.amount || 0,
      currency: res.payment_data?.currency || 'INR',
      hold_expires_at: expiresAt || '',
    });
    setPartySize(res.party_size);
    setDate(new Date(res.start_time));
    setTime(format(new Date(res.start_time), 'HH:mm'));
    if (expiresAt) {
      setHoldExpiresAt(new Date(expiresAt));
    }

    router.push(`/${cafe.slug}/checkout`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-brand-brown">Your Profile</h1>
          <p className="mt-1 text-sm text-brand-mocha">Account details, workspaces, and reservation history.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/15 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-brand-gold">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {PROFILE_ROLE_LABELS[role]}
        </span>
      </div>

      {/* Account details */}
      <section className="rounded-3xl bg-white shadow-card">
        <div className="p-8">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-red font-display text-xl font-bold text-white shadow-brand-md">
              {user.name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]!.toUpperCase())
                .join('')}
            </div>
            <div>
              {/* The Privacy Policy tells a Data Principal they can correct
                  their own name. No password prompt: a display name is not a
                  login identifier, and friction here discourages exactly the
                  correction the DPDP Act wants to be easy. */}
              {editing === 'name' ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = nameDraft.trim();
                    if (!value) {
                      toast.error('Name cannot be empty');
                      return;
                    }
                    changeName.mutate(
                      { name: value },
                      {
                        onSuccess: () => {
                          toast.success('Name updated.');
                          setEditing(null);
                        },
                      }
                    );
                  }}
                >
                  <input
                    aria-label="Your name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={120}
                    className="rounded-lg border border-brand-brown/20 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                  <button
                    type="submit"
                    disabled={changeName.isPending}
                    className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="text-xs font-bold text-brand-mocha hover:underline"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold text-brand-brown">{user.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(user.name);
                      setEditing('name');
                    }}
                    aria-label="Change name"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-mocha hover:text-brand-brown hover:underline"
                  >
                    <Pencil className="h-3 w-3" />
                    Change
                  </button>
                </div>
              )}
              <div className="mt-0.5 text-sm text-brand-mocha">{PROFILE_ROLE_LABELS[role]}</div>
            </div>
          </div>

          <div className="mb-6 h-px bg-brand-brown/10" />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-mochaMid">
                <Mail className="h-3.5 w-3.5" />
                Email
              </div>
              {editing === 'email' ? (
                <ChangeCredentialForm
                  label="email"
                  placeholder="New email address"
                  inputType="email"
                  isPending={changeEmail.isPending}
                  onCancel={() => setEditing(null)}
                  onSubmit={handleChangeEmail}
                  requireOtp={user.is_email_verified}
                  onRequestOtp={handleRequestStepUpOtp}
                  isRequestingOtp={requestStepUpOtp.isPending}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-brand-brown">{user.email}</span>
                  {user.pending_email ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-bold text-brand-gold">
                      Pending change to {user.pending_email}
                    </span>
                  ) : user.is_email_verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      Verified
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-red/10 px-2 py-0.5 text-[10px] font-bold text-brand-redDark">
                        <AlertCircle className="h-3 w-3" />
                        Not verified
                      </span>
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendVerification.isPending}
                        className="text-xs font-bold text-brand-red hover:underline disabled:opacity-50"
                      >
                        {resendVerification.isPending ? 'Sending…' : 'Resend verification email'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing('email')}
                    aria-label="Change email"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-mocha hover:text-brand-brown hover:underline"
                  >
                    <Pencil className="h-3 w-3" />
                    Change
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-mochaMid">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </div>
              {editing === 'phone' ? (
                <ChangeCredentialForm
                  label="phone number"
                  placeholder="New phone number"
                  inputType="tel"
                  isPending={changePhone.isPending}
                  onCancel={() => setEditing(null)}
                  onSubmit={handleChangePhone}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-brand-brown">{user.phone}</span>
                  <button
                    type="button"
                    onClick={() => setEditing('phone')}
                    aria-label="Change phone number"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-mocha hover:text-brand-brown hover:underline"
                  >
                    <Pencil className="h-3 w-3" />
                    Change
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-mochaMid">
                Member since
              </div>
              <div className="text-sm font-semibold text-brand-brown">{memberSince ?? '—'}</div>
            </div>

            <div>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-mochaMid">Role</div>
              <div className="text-sm font-semibold text-brand-brown">{PROFILE_ROLE_LABELS[role]}</div>
            </div>
          </div>
        </div>
      </section>

      <CafeApplicationCard user={user} application={cafeApplication} />

      {/* Organization (owner only) */}
      {isOwner && (
        <section>
          <h2 className="mb-3.5 font-display text-lg font-bold text-brand-brown">Your Organization</h2>
          {isOrgLoading ? (
            <div className="rounded-2xl border border-brand-brown/10 bg-white/80 p-5">
              <Skeleton className="h-5 w-1/3" />
            </div>
          ) : organization ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-brand-brown/10 bg-white/80 p-5 shadow-brand-sm">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tan">
                  <Building2 className="h-5 w-5 text-brand-mocha" />
                </div>
                <div>
                  <div className="text-[15.5px] font-bold text-brand-brown">{organization.name}</div>
                  <div className="mt-0.5 text-xs text-brand-mochaMid">
                    {ownedCafes.length} caf{ownedCafes.length === 1 ? 'e' : 'es'} &middot; Organization owner
                  </div>
                </div>
              </div>
              <Link
                href="/org/dashboard"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand-red hover:underline"
              >
                Manage organization
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white/50 p-6 text-center text-sm text-brand-mocha">
              Couldn&apos;t load your organization.
            </div>
          )}
        </section>
      )}

      {/* Cafes */}
      {showCafesSection && (
        <section>
          <h2 className="font-display text-lg font-bold text-brand-brown">Your Cafes</h2>
          <p className="mb-3.5 mt-0.5 text-sm text-brand-mocha">Quick links to the cafes you {isOwner ? 'own' : 'manage'}.</p>

          {isOwner && isCafesLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
          ) : isOwner ? (
            ownedCafes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white/50 p-6 text-center text-sm text-brand-mocha">
                No cafes found for your organization yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ownedCafes.map((cafe) => (
                  <Link
                    key={cafe._id}
                    href={`/${cafe.slug}/dashboard`}
                    className="block rounded-2xl border border-brand-brown/10 bg-white/80 p-4 shadow-brand-sm transition-shadow hover:shadow-brand-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-display text-[15.5px] font-bold leading-snug text-brand-brown">
                        {cafe.name}
                      </span>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-mocha" />
                    </div>
                    <span
                      className={`mt-2.5 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${subscriptionStyle(cafe.subscription_status)}`}
                    >
                      {cafe.subscription_status}
                    </span>
                    <div className="mt-3 text-xs text-brand-mocha">Role: Owner</div>
                  </Link>
                ))}
              </div>
            )
          ) : managerCafes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand-brown/20 bg-white/50 p-6 text-center text-sm text-brand-mocha">
              You&apos;re not assigned to any cafes yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {managerCafes.map((cafe) => (
                <Link
                  key={cafe.slug}
                  href={`/${cafe.slug}/dashboard`}
                  className="block rounded-2xl border border-brand-brown/10 bg-white/80 p-4 shadow-brand-sm transition-shadow hover:shadow-brand-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-[15.5px] font-bold leading-snug text-brand-brown">
                      {cafe.name}
                    </span>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-mocha" />
                  </div>
                  <div className="mt-3 text-xs text-brand-mocha">Role: Manager</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Reservation history */}
      <section>
        <h2 className="font-display text-lg font-bold text-brand-brown">Reservation History</h2>
        <p className="mb-3.5 mt-0.5 text-sm text-brand-mocha">Your past and upcoming bookings across all cafes.</p>

        {isReservationsLoading ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-card">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-brand-red" />
            <p className="text-xs font-semibold text-brand-mocha">Fetching your reservations…</p>
          </div>
        ) : reservations.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-card">
            <p className="text-sm font-semibold text-brand-brown">No reservations yet</p>
            <p className="mt-1 text-xs text-brand-mocha">Bookings you make at any cafe will show up here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reservations.map((res) => {
              const startDate = new Date(res.start_time);
              const resId = String(res._id || res.id || '');
              const cafe = reservationCafe(res);
              const isPast = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'LEFT_BEFORE_SEATING'].includes(
                res.status
              );

              return (
                <div key={resId} className={`ticket-card flex items-stretch ${isPast ? 'opacity-60' : ''}`}>
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center bg-brand-gold/15 text-brand-gold">
                    <span className="font-mono text-lg font-bold tabular-nums">#{resId.slice(-4)}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={res.status} />
                        {cafe && <span className="text-sm font-bold text-brand-brown">{cafe.name}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-brand-mocha">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-brand-red" />
                          {format(startDate, 'EEE, MMM d')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-brand-red" />
                          {format(startDate, 'h:mm a')}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-brand-red" />
                          {res.party_size} guests
                        </span>
                      </div>
                    </div>

                    {res.status === 'PENDING_PAYMENT' && cafe && (
                      <button
                        onClick={() => resumePayment(res)}
                        className="cta-hero shrink-0 whitespace-nowrap px-4 py-2.5 text-xs font-bold shadow-brand-sm"
                      >
                        Complete Payment
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
