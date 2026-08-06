'use client';

import { useBookingStore } from '@/store/use-booking-store';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useTenant } from '@/components/providers/tenant-provider';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

export function CheckoutCard() {
  const { reservation, partySize, date, time } = useBookingStore();
  const { cafe } = useTenant();
  const router = useRouter();

  // In a real app, this amount would come from the reservation response
  const amount = 500; 

  const handlePay = async () => {
    try {
      await openRazorpayCheckout({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'test_key',
        amount: amount * 100, // in paise
        currency: 'INR',
        name: cafe.name,
        description: 'Reservation Deposit',
        order_id: 'order_' + Math.random().toString(36).substring(7), // Mock order ID
        handler: function (response) {
          console.log('Payment Successful', response);
          router.push(`/${cafe.slug}/success`);
        },
        theme: {
          color: cafe.brandPrimaryColor || '#000000',
        }
      });
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-center text-2xl">Confirm Reservation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date:</span>
            <span className="font-medium">{date ? format(date, 'MMM do, yyyy') : 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time:</span>
            <span className="font-medium">{time}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Party Size:</span>
            <span className="font-medium">{partySize} People</span>
          </div>
        </div>
        
        <div className="flex justify-between items-center text-lg font-bold border-t pt-4">
          <span>Deposit Required:</span>
          <span>₹{amount}</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handlePay} className="w-full h-12 text-lg">
          Pay ₹{amount} to Confirm
        </Button>
      </CardFooter>
    </Card>
  );
}
