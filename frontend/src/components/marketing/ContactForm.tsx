'use client';

import { useState, FormEvent } from 'react';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { toast } from 'sonner';
import { Loader2, Send, User, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Deliberately permissive (not a full RFC 5322 check) — just enough to catch
// "forgot the @" / "forgot the domain" typos before they reach the server,
// without rejecting anything a real address might legitimately look like.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = 'Name is required.';
    if (!email.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!message.trim()) errors.message = 'Message is required.';
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSending(true);
    try {
      await axiosInstance.post('/api/v1/contact', { name, email, message });
      toast.success("Message sent — we'll get back to you soon.");
      setName('');
      setEmail('');
      setMessage('');
      setFieldErrors({});
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send your message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // noValidate: the browser's own type="email" constraint validation would
  // otherwise silently block submission (no visible message) before our
  // handler runs — our validate() drives all error messaging instead, so
  // it's consistently styled and never silent.
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Name
        </label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-mocha/40 pointer-events-none" aria-hidden="true" />
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-brand-brown/15 bg-white
                       focus:ring-2 focus:ring-brand-red focus:border-transparent focus:outline-none
                       text-sm transition-shadow"
          />
        </div>
        {fieldErrors.name && (
          <p id="contact-name-error" className="mt-1.5 text-xs font-semibold text-rose-600">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-mocha/40 pointer-events-none" aria-hidden="true" />
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-brand-brown/15 bg-white
                       focus:ring-2 focus:ring-brand-red focus:border-transparent focus:outline-none
                       text-sm transition-shadow"
          />
        </div>
        {fieldErrors.email && (
          <p id="contact-email-error" className="mt-1.5 text-xs font-semibold text-rose-600">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Message
        </label>
        <div className="relative">
          <MessageSquare className="absolute left-4 top-3.5 w-4 h-4 text-brand-mocha/40 pointer-events-none" aria-hidden="true" />
          <textarea
            id="contact-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={!!fieldErrors.message}
            aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
            className="w-full pl-11 pr-4 py-3 rounded-2xl border border-brand-brown/15 bg-white
                       focus:ring-2 focus:ring-brand-red focus:border-transparent focus:outline-none
                       text-sm transition-shadow resize-none"
          />
        </div>
        {fieldErrors.message && (
          <p id="contact-message-error" className="mt-1.5 text-xs font-semibold text-rose-600">
            {fieldErrors.message}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5">
          <p className="text-xs font-semibold text-rose-600">{error}</p>
        </div>
      )}

      <Button type="submit" variant="brand" size="lg" disabled={isSending} className="w-full">
        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send message
      </Button>
    </form>
  );
}
