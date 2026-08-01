'use client';

import React, { useState, useEffect, use } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  apiGetCafeBySlug,
  apiGetAvailableSlots,
  apiCreateReservation,
  apiSimulateWebhook,
} from '../../../lib/api';

export default function CustomerBookingPage({ params }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;
  const { user, token, login } = useAuth();

  const [cafe, setCafe] = useState(null);
  const [loadingCafe, setLoadingCafe] = useState(true);
  const [cafeError, setCafeError] = useState('');

  // Search parameters
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('19:00');
  const [partySize, setPartySize] = useState(2);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);

  // Booking Hold & Payment Modal state
  const [bookingModal, setBookingModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [activeReservation, setActiveReservation] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    loadCafe();
  }, [slug]);

  const loadCafe = async () => {
    setLoadingCafe(true);
    setCafeError('');
    try {
      const res = await apiGetCafeBySlug(slug);
      setCafe(res.data);
    } catch (err) {
      setCafeError(err.message || `Cafe with slug '${slug}' not found`);
    } finally {
      setLoadingCafe(false);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!cafe) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await apiGetAvailableSlots(cafe._id, date, time, partySize);
      setSearchResult(res.data);
    } catch (err) {
      alert(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  const handleOpenBooking = (slot) => {
    setSelectedSlot(slot);
    setBookingModal(true);
    setBookingError('');
  };

  const handleConfirmHoldAndPay = async () => {
    setBookingLoading(true);
    setBookingError('');
    try {
      let currentToken = token;
      // Auto-authenticate as demo user if not logged in
      if (!currentToken) {
        try {
          const authUser = await login('demo@customer.com', 'password123');
          currentToken = localStorage.getItem('nextbooq_token');
        } catch (authErr) {
          throw new Error('Please log in using the Navbar to complete your booking.');
        }
      }

      // Step 1: Create Hold Reservation & Razorpay Order
      const res = await apiCreateReservation(
        cafe._id,
        {
          start_time: selectedSlot.start_time,
          party_size: partySize,
          deposit_amount: 100,
        },
        currentToken
      );

      const reservationData = res.data;
      setActiveReservation(reservationData);

      // Step 2: Simulate Razorpay Payment Webhook
      await apiSimulateWebhook(reservationData.razorpay_order_id);
      setPaymentSuccess(true);
    } catch (err) {
      setBookingError(err.message || 'Booking hold creation failed');
    } finally {
      setBookingLoading(false);
    }
  };

  if (loadingCafe) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ color: 'var(--accent-primary)', fontSize: '1.2rem', fontWeight: '600' }}>
          Loading Cafe Profile...
        </div>
      </div>
    );
  }

  if (cafeError || !cafe) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
        <div className="glass-panel" style={{ padding: '40px' }}>
          <h2 style={{ fontSize: '1.8rem', color: '#f87171', marginBottom: '16px' }}>Cafe Not Found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            No active cafe found for slug: <code style={{ color: '#34d399' }}>{slug}</code>.
          </p>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', textAlign: 'left', marginBottom: '24px' }}>
            <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '8px' }}>💡 Quick Setup Instruction</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Make sure the backend server is running on <code style={{ color: '#10b981' }}>http://localhost:5000</code>. You can seed a demo cafe with slug <code style={{ color: '#10b981' }}>bistro-central</code> using the Quickstart button on the homepage!
            </p>
          </div>

          <a href="/" className="btn-primary">Go to Homepage / Seed Data</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '40px auto', padding: '0 20px' }} className="animate-fade-in">
      {/* Cafe Header Banner */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(17, 24, 39, 0.8))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <span style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Verified Cafe Tenant
            </span>
            <h1 style={{ fontSize: '2.5rem', margin: '4px 0 8px 0' }}>{cafe.name}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              📍 Timezone: <strong>{cafe.timezone}</strong> | Lead Time: <strong>{cafe.reservation_rules?.booking_lead_time_hours || 24}h</strong>
            </p>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Default Turn Time</div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#34d399' }}>
              {cafe.reservation_rules?.default_turn_time_minutes || 90} mins
            </div>
          </div>
        </div>
      </div>

      {/* Search & Slot Finder Widget */}
      <div className="glass-panel" style={{ padding: '28px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Find Available Tables</h2>

        <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Time Slot</label>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ width: '100%', padding: '12px', background: '#1f2937', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
            >
              {['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map((t) => (
                <option key={t} value={t}>{t} UTC</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Party Size</label>
            <input
              type="number"
              min="1"
              max="20"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', color: '#fff' }}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={searching} style={{ height: '46px' }}>
            {searching ? 'Searching...' : '🔍 Check Availability'}
          </button>
        </form>
      </div>

      {/* Search Results Display */}
      {searchResult && (
        <div className="glass-panel" style={{ padding: '28px', marginBottom: '32px' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>
            Search Results for {partySize} guests on {date} at {time}
          </h3>

          {searchResult.available && searchResult.available_slots.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {searchResult.available_slots.map((slot, index) => (
                <div key={index} style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#34d399', marginBottom: '8px' }}>
                    {new Date(slot.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Turn Time: {cafe.reservation_rules?.default_turn_time_minutes || 90} mins
                  </div>
                  <button onClick={() => handleOpenBooking(slot)} className="btn-primary" style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}>
                    Reserve Slot
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '24px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', color: '#f87171' }}>
              ⚠️ No single or merged table configuration available for a party of {partySize} at {time}. Please try a different party size or time slot.
            </div>
          )}
        </div>
      )}

      {/* Booking Hold & Razorpay Payment Modal */}
      {bookingModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '32px', position: 'relative' }}>
            <button onClick={() => setBookingModal(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', color: 'var(--text-muted)', fontSize: '1.2rem' }}>✕</button>

            {!paymentSuccess ? (
              <>
                <h3 style={{ fontSize: '1.4rem', marginBottom: '12px' }}>Confirm Reservation Hold</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                  A temporary 10-minute hold will be placed in MongoDB using ACID transactions.
                </p>

                {bookingError && (
                  <div style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
                    {bookingError}
                  </div>
                )}

                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '16px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Location:</span>
                    <strong style={{ color: '#fff' }}>{cafe.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Time Slot:</span>
                    <strong style={{ color: '#34d399' }}>{new Date(selectedSlot?.start_time).toUTCString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Party Size:</span>
                    <strong style={{ color: '#fff' }}>{partySize} Guests</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '1rem', fontWeight: '700' }}>
                    <span>Deposit Payable (Razorpay):</span>
                    <span style={{ color: '#10b981' }}>₹100.00</span>
                  </div>
                </div>

                <button
                  onClick={handleConfirmHoldAndPay}
                  disabled={bookingLoading}
                  className="btn-primary"
                  style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                >
                  {bookingLoading ? 'Securing Transactional Hold...' : '💳 Pay ₹100 with Razorpay'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
                <h3 style={{ fontSize: '1.6rem', color: '#34d399', marginBottom: '12px' }}>Reservation Confirmed!</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  Razorpay webhook verified. Status updated to <strong>CONFIRMED</strong>.
                </p>

                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '16px', textAlign: 'left', marginBottom: '24px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Reservation Ref ID:</div>
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#fff', fontFamily: 'monospace' }}>
                    {activeReservation?.reservation_id}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Razorpay Order ID:</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#60a5fa', fontFamily: 'monospace' }}>
                    {activeReservation?.razorpay_order_id}
                  </div>
                </div>

                <button onClick={() => { setBookingModal(false); setPaymentSuccess(false); handleSearch(); }} className="btn-primary" style={{ width: '100%' }}>
                  Done & View Status
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
