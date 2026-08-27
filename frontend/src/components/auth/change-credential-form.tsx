'use client';

import { useState } from 'react';

export function ChangeCredentialForm({
  label,
  placeholder,
  inputType,
  isPending,
  onSubmit,
  onCancel,
  requireOtp = false,
  onRequestOtp,
  isRequestingOtp = false,
}: {
  label: string;
  placeholder: string;
  inputType: 'email' | 'tel';
  isPending: boolean;
  onSubmit: (value: string, currentPassword: string, otpCode: string) => void;
  onCancel: () => void;
  requireOtp?: boolean;
  onRequestOtp?: () => void;
  isRequestingOtp?: boolean;
}) {
  const [value, setValue] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim(), currentPassword, otpCode);
      }}
      className="flex flex-col gap-2 rounded-xl border border-brand-brown/15 bg-brand-tan/20 p-3"
    >
      <input
        type={inputType}
        required
        autoFocus
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm focus:border-brand-red focus:outline-none"
      />
      <input
        type="password"
        required
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm focus:border-brand-red focus:outline-none"
      />
      {requireOtp && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-brown/10 bg-white/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-brand-mocha">For your security, confirm it&apos;s you.</span>
            <button
              type="button"
              onClick={() => {
                onRequestOtp?.();
                setCodeSent(true);
              }}
              disabled={isRequestingOtp}
              className="shrink-0 text-xs font-bold text-brand-red hover:underline disabled:opacity-50"
            >
              {isRequestingOtp ? 'Sending…' : codeSent ? 'Resend code' : 'Send code'}
            </button>
          </div>
          <input
            type="text"
            inputMode="numeric"
            required
            maxLength={6}
            placeholder="6-digit security code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border border-brand-brown/20 bg-white px-3 py-2 text-sm font-mono tracking-widest focus:border-brand-red focus:outline-none"
          />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {isPending ? 'Saving…' : `Save ${label}`}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-bold text-brand-mocha hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
