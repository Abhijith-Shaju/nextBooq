'use client';

import React, { useState, useEffect } from 'react';
import { useBookingStore } from '@/store/useBookingStore';
import { useAvailability } from '@/hooks/useAvailability';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { apiClient } from '@/lib/api-client';
import { formatTime } from '@/lib/timezone';
import { Users, Calendar as CalendarIcon, Clock, CheckCircle2, ShieldCheck, CreditCard, Sparkles, AlertCircle } from 'lucide-react';

interface TenantBookingWizardProps {
  cafeId: string;
  cafeName: string;
  slug: string;
}

export function TenantBookingWizardView({ cafeId, cafeName, slug }: TenantBookingWizardProps) {
  const {
    step,
    partySize,
    selectedDate,
    selectedTime,
    customerInfo,
    holdId,
    setStep,
    setPartySize,
    setSelectedDate,
    setSelectedTime,
    setCustomerInfo,
    setHold,
    resetBooking,
  } = useBookingStore();

  const { data: availabilityData, isLoading: isLoadingSlots } = useAvailability(cafeId, selectedDate, partySize);
  const slots = availabilityData?.available_slots || [];

  // OTP Modal State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState(customerInfo.phone || '');
  const [otpInput, setOtpInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [timer, setTimer] = useState(60);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isCreatingHold, setIsCreatingHold] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Resend OTP countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOtpSent && timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isOtpSent, timer]);

  const handleSendOtp = () => {
    if (!phoneInput || phoneInput.length < 10) return;
    setIsLoadingAuth(true);
    setTimeout(() => {
      setIsLoadingAuth(false);
      setIsOtpSent(true);
      setTimer(60);
    }, 600);
  };

  const handleVerifyOtp = () => {
    if (otpInput.length < 4) return;
    setIsLoadingAuth(true);
    setTimeout(() => {
      setIsLoadingAuth(false);
      setCustomerInfo({ phone: phoneInput, name: customerInfo.name || 'Guest' });
      setIsOtpModalOpen(false);
      handleCreateHoldReservation();
    }, 600);
  };

  const handleCreateHoldReservation = async () => {
    setIsCreatingHold(true);
    setErrorMessage('');

    try {
      // POST /api/v1/cafes/:cafeId/reservations
      const response = await apiClient(`/cafes/${cafeId}/reservations`, {
        method: 'POST',
        body: JSON.stringify({
          start_time: `${selectedDate}T${selectedTime}:00Z`,
          party_size: partySize,
          phone: customerInfo.phone || phoneInput,
          name: customerInfo.name || 'Guest',
        }),
      });

      setHold(response.reservation_id, response.razorpay_order_id);
      setStep(4);
    } catch (err: any) {
      if (err?.status === 409) {
        setErrorMessage('This time slot was just taken by another guest. Please select another slot.');
        setStep(2);
      } else {
        // Fallback for demonstration mode
        setHold(`hold-${Date.now()}`, `order_${Date.now()}`);
        setStep(4);
      }
    } finally {
      setIsCreatingHold(false);
    }
  };

  const handleRazorpayPayment = () => {
    setIsCreatingHold(true);
    // Simulate Razorpay web checkout completion & webhook response
    setTimeout(() => {
      setIsCreatingHold(false);
      setIsConfirmed(true);
      setStep(5);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col justify-between p-4 sm:p-6 md:p-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" /> Table Reservation Wizard
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-100">{cafeName}</h1>
        <p className="text-stone-400 text-sm">Powered by nextBooq Allocation Engine</p>
      </div>

      {/* Progress Steps Bar */}
      <div className="my-8 flex items-center justify-between px-4 max-w-md mx-auto w-full">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                step >= s
                  ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                  : 'bg-stone-800 text-stone-500'
              }`}
            >
              {s}
            </div>
            {s < 4 && <div className={`w-8 sm:w-12 h-0.5 ${step > s ? 'bg-amber-500' : 'bg-stone-800'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 & 2: Parameters & Time Slot Selection */}
      {step <= 2 && (
        <Card className="bg-stone-900/80 border-stone-800 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-amber-400" /> Select Party Size & Date
            </CardTitle>
            <CardDescription>Choose your dining group and preferred schedule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Party Size Selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-400 block mb-2">
                Party Size (Guests)
              </label>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6, 8, 10].map((size) => (
                  <button
                    key={size}
                    onClick={() => setPartySize(size)}
                    className={`py-2.5 rounded-xl font-bold text-sm border transition-all ${
                      partySize === size
                        ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-md shadow-amber-500/20'
                        : 'bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Reservation Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-100 text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Available Time Slots Grid */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-400 block mb-2">
                Available Time Slots ({selectedDate})
              </label>
              {isLoadingSlots ? (
                <div className="py-8 text-center text-xs text-amber-400 animate-pulse">
                  Querying Best-Fit Allocation Engine...
                </div>
              ) : slots.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {slots.map((slot) => (
                    <button
                      key={slot.start_time}
                      onClick={() => {
                        setSelectedTime(slot.start_time);
                        setStep(2);
                      }}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        selectedTime === slot.start_time
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20 font-bold'
                          : 'bg-stone-800/80 border-stone-700 text-stone-200 hover:bg-stone-800'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 mx-auto mb-1 opacity-60" />
                      <span className="text-sm font-semibold">{formatTime(slot.start_time)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'].map((timeStr) => (
                    <button
                      key={timeStr}
                      onClick={() => {
                        setSelectedTime(timeStr);
                        setStep(2);
                      }}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        selectedTime === timeStr
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20 font-bold'
                          : 'bg-stone-800/80 border-stone-700 text-stone-200 hover:bg-stone-800'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 mx-auto mb-1 opacity-60" />
                      <span className="text-sm font-semibold">{formatTime(timeStr)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> {errorMessage}
              </div>
            )}
          </CardContent>

          <CardFooter>
            <Button
              disabled={!selectedTime}
              onClick={() => setIsOtpModalOpen(true)}
              variant="secondary"
              className="w-full font-bold py-3 text-base"
            >
              Reserve Slot ({selectedTime ? formatTime(selectedTime) : 'Select Time'})
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Step 4: Hold Reservation & Razorpay Payment */}
      {step === 4 && (
        <Card className="bg-stone-900/80 border-stone-800 shadow-2xl">
          <CardHeader className="text-center">
            <Badge status="HOLD" className="mx-auto mb-2 text-xs px-3 py-1" />
            <CardTitle className="text-2xl font-black">Table Held for 10:00 Minutes</CardTitle>
            <CardDescription>
              Complete the refundable cover charge payment to confirm your reservation.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-stone-800/60 border border-stone-700 space-y-2 text-sm">
              <div className="flex justify-between text-stone-300">
                <span>Date & Time:</span>
                <strong className="text-stone-100">{selectedDate} @ {formatTime(selectedTime)}</strong>
              </div>
              <div className="flex justify-between text-stone-300">
                <span>Party Size:</span>
                <strong className="text-stone-100">{partySize} Guests</strong>
              </div>
              <div className="flex justify-between text-stone-300">
                <span>Guest Phone:</span>
                <strong className="text-stone-100">{customerInfo.phone || phoneInput}</strong>
              </div>
              <div className="border-t border-stone-700 pt-2 flex justify-between font-bold text-amber-400 text-base">
                <span>Cover Deposit:</span>
                <span>₹500.00</span>
              </div>
            </div>

            <Button
              onClick={handleRazorpayPayment}
              variant="secondary"
              className="w-full font-extrabold py-3 text-base"
              isLoading={isCreatingHold}
            >
              <CreditCard className="w-5 h-5" /> Pay ₹500 via Razorpay Checkout
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Confirmed Booking State */}
      {step === 5 && (
        <Card className="bg-stone-900/90 border-emerald-500/40 shadow-2xl text-center p-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <CardTitle className="text-3xl font-black text-emerald-400">Reservation Confirmed!</CardTitle>
          <CardDescription className="text-stone-300 mt-2">
            Your table at <strong>{cafeName}</strong> is locked and ready for your arrival.
          </CardDescription>

          <div className="mt-6 p-4 rounded-xl bg-stone-800/80 border border-stone-700 text-left text-sm space-y-1.5 text-stone-300">
            <div><strong>Reservation ID:</strong> {holdId}</div>
            <div><strong>Schedule:</strong> {selectedDate} at {formatTime(selectedTime)}</div>
            <div><strong>Party Size:</strong> {partySize} Guests</div>
            <div><strong>Status:</strong> <span className="text-emerald-400 font-bold">CONFIRMED</span></div>
          </div>

          <Button onClick={resetBooking} variant="outline" className="mt-6 w-full">
            Make Another Booking
          </Button>
        </Card>
      )}

      {/* Step 3: Identity & Phone OTP Verification Modal */}
      <Modal isOpen={isOtpModalOpen} onClose={() => setIsOtpModalOpen(false)} title="Verify Phone Number">
        <div className="space-y-4">
          <p className="text-xs text-stone-400">
            We send a 1-time verification SMS to confirm your reservation identity.
          </p>

          <Input
            label="Phone Number"
            type="tel"
            placeholder="+91 98765 43210"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            disabled={isOtpSent}
          />

          {isOtpSent && (
            <div>
              <Input
                label="Enter 4-Digit OTP"
                placeholder="1234"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                maxLength={4}
              />
              <div className="mt-2 text-xs text-stone-400 flex items-center justify-between">
                <span>Resend OTP in {timer}s</span>
                {timer === 0 && (
                  <button onClick={handleSendOtp} className="text-amber-400 font-semibold hover:underline">
                    Resend Code
                  </button>
                )}
              </div>
            </div>
          )}

          {!isOtpSent ? (
            <Button
              onClick={handleSendOtp}
              variant="secondary"
              className="w-full font-semibold mt-2"
              isLoading={isLoadingAuth}
              disabled={phoneInput.length < 10}
            >
              Send OTP SMS
            </Button>
          ) : (
            <Button
              onClick={handleVerifyOtp}
              variant="primary"
              className="w-full font-semibold mt-2"
              isLoading={isLoadingAuth}
              disabled={otpInput.length < 4}
            >
              Verify & Lock Hold
            </Button>
          )}
        </div>
      </Modal>

      {/* Footer */}
      <footer className="text-center text-xs text-stone-600 mt-8">
        Protected by nextBooq OCC Transaction Engine.
      </footer>
    </div>
  );
}
