'use client';

import { useState, FormEvent } from 'react';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in every field.');
      return;
    }

    setIsSending(true);
    try {
      await axiosInstance.post('/api/v1/contact', { name, email, message });
      toast.success("Message sent — we'll get back to you soon.");
      setName('');
      setEmail('');
      setMessage('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send your message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-semibold text-brand-brown mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm"
        />
      </div>

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={isSending}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-red px-5 py-2.5 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-redDark disabled:opacity-50"
      >
        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send message
      </button>
    </form>
  );
}
