'use client';

import { useState } from 'react';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { useRequestStepUpOtp } from '@/hooks/auth/use-request-step-up-otp';
import { CreditCard, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';

interface WebhookReveal {
  url: string;
  secret: string;
}

interface PaymentsEditorProps {
  cafeId: string;
  razorpayKeyId: string;
  configured: boolean;
  onSaved: (webhook: WebhookReveal) => void;
}

export function PaymentsEditor({ cafeId, razorpayKeyId, configured, onSaved }: PaymentsEditorProps) {
  const [replacing, setReplacing] = useState(!configured);
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestStepUpOtp = useRequestStepUpOtp();

  const modeLabel = razorpayKeyId.startsWith('rzp_live_') ? 'Live mode' : razorpayKeyId.startsWith('rzp_test_') ? 'Test mode' : null;

  const handleRequestOtp = () => {
    requestStepUpOtp.mutate(undefined, { onSuccess: () => setCodeSent(true) });
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await axiosInstance.put(`/api/v1/cafes/${cafeId}/payments`, {
        razorpay_key_id: keyId,
        razorpay_key_secret: keySecret,
        otp_code: otpCode,
      });
      onSaved(res.data.data.payments_webhook);
      setReplacing(false);
      setKeyId('');
      setKeySecret('');
      setOtpCode('');
      setCodeSent(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save Razorpay credentials');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-6 border-t border-brand-brown/10 space-y-4">
      <h2 className="text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
        <CreditCard className="w-4 h-4 text-brand-red" /> Payments
      </h2>

      {configured && !replacing ? (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-mono">{razorpayKeyId}</span>
            {modeLabel && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold">{modeLabel}</span>}
          </div>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="text-xs font-semibold text-brand-red hover:underline"
          >
            Replace credentials
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            Not yet configured — reservations can&apos;t be paid for until this cafe&apos;s own Razorpay account is
            connected.
          </div>

          <div>
            <label htmlFor="razorpay-key-id" className="block text-sm font-semibold text-brand-brown mb-1.5">
              Key ID
            </label>
            <input
              id="razorpay-key-id"
              type="text"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="rzp_live_..."
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono"
            />
          </div>

          <div>
            <label htmlFor="razorpay-key-secret" className="block text-sm font-semibold text-brand-brown mb-1.5">
              Key Secret
            </label>
            <input
              id="razorpay-key-secret"
              type="password"
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono"
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-amber-800">
                For your security, confirm it&apos;s you before saving payout details.
              </span>
              <button
                type="button"
                onClick={handleRequestOtp}
                disabled={requestStepUpOtp.isPending}
                className="shrink-0 text-xs font-bold text-brand-red hover:underline disabled:opacity-50"
              >
                {requestStepUpOtp.isPending ? 'Sending…' : codeSent ? 'Resend code' : 'Send code'}
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit security code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm font-mono tracking-widest focus:border-brand-red focus:outline-none"
            />
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !keyId || !keySecret || otpCode.length < 6}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-redDark disabled:opacity-50"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {configured ? 'Save new credentials' : 'Connect Razorpay'}
          </button>
        </div>
      )}
    </div>
  );
}
