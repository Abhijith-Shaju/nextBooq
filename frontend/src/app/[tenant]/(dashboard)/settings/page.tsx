'use client';

import { useState } from 'react';
import { useTenant } from '@/components/providers/tenant-provider';
import { axiosInstance } from '@/hooks/api/axios-instance';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Settings as SettingsIcon, Clock, Users, ShieldAlert, Hourglass, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CafeSettingsPage() {
  const { cafe } = useTenant();
  const queryClient = useQueryClient();

  const rules = cafe.reservation_rules || {
    default_turn_time_minutes: 90,
    max_party_size: 12,
    booking_lead_time_hours: 24,
    hold_duration_minutes: 10,
  };

  const [turnTime, setTurnTime] = useState(rules.default_turn_time_minutes || 90);
  const [maxParty, setMaxParty] = useState(rules.max_party_size || 12);
  const [leadTime, setLeadTime] = useState(rules.booking_lead_time_hours || 24);
  const [holdDuration, setHoldDuration] = useState(rules.hold_duration_minutes || 10);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await axiosInstance.put(`/api/v1/cafes/${cafe.id}`, {
        reservation_rules: {
          default_turn_time_minutes: turnTime,
          max_party_size: maxParty,
          booking_lead_time_hours: leadTime,
          hold_duration_minutes: holdDuration,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['cafe', cafe.slug] });
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
              <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-brand-red" /> Default Turn Time (Minutes)
              </label>
              <input
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
              <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-red" /> Maximum Party Size
              </label>
              <input
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
              <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-brand-red" /> Booking Lead Time (Hours)
              </label>
              <input
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
              <label className="block text-sm font-semibold text-brand-brown mb-1.5 flex items-center gap-1.5">
                <Hourglass className="w-4 h-4 text-brand-red" /> Checkout Hold Duration (Minutes)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                required
                value={holdDuration}
                onChange={(e) => setHoldDuration(parseInt(e.target.value) || 10)}
                className="w-full px-4 py-3 rounded-xl border border-brand-brown/20 bg-white focus:ring-2 focus:ring-brand-red focus:outline-none text-sm font-mono tabular-nums"
              />
              <p className="text-[11px] text-brand-mochaMid mt-1">Time allowed for customer to complete deposit payment.</p>
            </div>
          </div>

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
