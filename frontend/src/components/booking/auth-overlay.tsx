'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useBookTable } from '@/hooks/public/use-book-table';
import { useBookingStore } from '@/store/use-booking-store';

export function AuthOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { isAuthenticated, user } = useAuth();
  const { cafe, date, time, partySize } = useBookingStore();
  const bookTable = useBookTable(cafe?.id, cafe?.slug);

  // If already authenticated, just proceed with booking
  if (isAuthenticated && open) {
    if (date && time) {
      bookTable.mutate({
        date: date.toISOString(),
        time,
        partySize,
      });
      onOpenChange(false);
    }
  }

  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <Dialog open={open && !isAuthenticated} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Almost there!</DialogTitle>
          <DialogDescription>
            Sign in or create an account to secure your reservation at {cafe?.name}.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" />
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Sign In & Book</Button>
          </TabsContent>
          
          <TabsContent value="register" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" />
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Create Account & Book</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
