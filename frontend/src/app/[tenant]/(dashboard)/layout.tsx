'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTenant } from '@/components/providers/tenant-provider';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { Coffee, LayoutDashboard, Calendar, Grid, Settings, LogOut, User } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { cafe } = useTenant();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  // WebSocket Connection Lifecycle
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Real-Time WebSocket connected:', socket.id);
      if (cafe?.id) {
        socket.emit('join_cafe_room', cafe.id);
      }
    });

    socket.on('reservation_updated', () => {
      // Silently invalidate reservations query without disrupting active user
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [cafe?.id, queryClient]);

  const navItems = [
    { label: 'Host Stand', href: `/${cafe.slug}/dashboard`, icon: LayoutDashboard },
    { label: 'Reservations', href: `/${cafe.slug}/reservations`, icon: Calendar },
    { label: 'Tables Inventory', href: `/${cafe.slug}/tables`, icon: Grid },
    { label: 'Cafe Settings', href: `/${cafe.slug}/settings`, icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-brand-cream flex flex-col md:flex-row font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 glass border-r border-brand-brown/10 p-6 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-brand-red rounded-2xl flex items-center justify-center text-white shadow-brand-md">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold font-display text-brand-brown text-lg leading-tight truncate max-w-[140px]">
                {cafe.name}
              </h2>
              <span className="text-[11px] font-mono text-brand-mocha">/{cafe.slug}</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.label === 'Host Stand' && pathname.endsWith('/dashboard'));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-red text-white shadow-brand-sm'
                      : 'text-brand-brown hover:bg-brand-tan/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Profile & Logout */}
        <div className="pt-6 border-t border-brand-brown/10 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-brand-brown/10 text-brand-brown flex items-center justify-center font-bold text-xs">
              <User className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-brand-brown truncate">{user?.name || 'Operator'}</p>
              <p className="text-[10px] text-brand-mocha truncate">{user?.email || 'staff@nextbooq.com'}</p>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 transition-all border border-rose-200"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
