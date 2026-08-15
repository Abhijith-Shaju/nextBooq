'use client';

import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';

export function PricingCards() {

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: '₹1,999',
      period: '/month',
      description: 'Perfect for boutique cafes getting started with online bookings.',
      features: [
        'Up to 10 Physical Tables',
        'Customer Booking Widget',
        'Standard Email Confirmations',
        'Basic Host Stand View',
        'Email Support',
      ],
      highlight: false,
    },
    {
      id: 'pro',
      name: 'Professional',
      price: '₹4,999',
      period: '/month',
      description: 'Ideal for busy cafes requiring real-time host stand & deposit collection.',
      features: [
        'Unlimited Physical Tables',
        'Razorpay Deposit Integration',
        'Real-Time WebSocket Floorplan',
        'Optimistic Concurrency Control',
        'Turn Time Rules & Lead Times',
        '24/7 Priority Support',
      ],
      highlight: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'Designed for multi-location cafe chains and franchises.',
      features: [
        'Multi-Tenant Chain Dashboard',
        'Custom Domain & Branding',
        'Dedicated Account Manager',
        'Custom POS & Webhook Integrations',
        'SLA & Uptime Guarantees',
      ],
      highlight: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
      {plans.map((plan) => {
        return (
          <div
            key={plan.id}
            className={`relative rounded-3xl p-8 transition-all duration-300 flex flex-col justify-between ${
              plan.highlight
                ? 'bg-gradient-to-b from-brand-brown to-stone-900 text-white shadow-brand-xl scale-[1.02] border-2 border-brand-red'
                : 'glass text-brand-brown border border-brand-brown/10 hover:border-brand-mocha/30'
            }`}
          >
            {plan.highlight && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-brand-red text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                <Sparkles className="w-3.5 h-3.5" /> Most Popular Choice
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold font-display">{plan.name}</h3>
              </div>

              <p
                className={`text-xs mb-6 ${
                  plan.highlight ? 'text-stone-300' : 'text-brand-mocha'
                }`}
              >
                {plan.description}
              </p>

              <div className="flex items-baseline mb-6">
                <span className="text-4xl font-extrabold font-display">{plan.price}</span>
                <span
                  className={`text-sm ml-1 ${
                    plan.highlight ? 'text-stone-300' : 'text-brand-mocha'
                  }`}
                >
                  {plan.period}
                </span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm">
                    <Check
                      className={`w-4 h-4 shrink-0 ${
                        plan.highlight ? 'text-brand-blush' : 'text-brand-red'
                      }`}
                    />
                    <span className={plan.highlight ? 'text-stone-200' : 'text-brand-brown'}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              href="/auth/register"
              className={`w-full py-3.5 px-6 rounded-full font-semibold transition-all duration-200 shadow-md ${
                plan.highlight
                  ? 'bg-brand-red hover:bg-red-700 text-white'
                  : 'bg-brand-brown hover:bg-stone-900 text-white'
              }`}
            >
              Create account
            </Link>
          </div>
        );
      })}
    </div>
  );
}
