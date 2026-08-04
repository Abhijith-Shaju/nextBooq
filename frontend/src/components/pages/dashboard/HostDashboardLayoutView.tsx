'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDashboardStore } from '@/store/useDashboardStore';
import { LayoutDashboard, ClipboardList, Grid, Settings, Sparkles, Wifi, WifiOff, Store } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export function HostDashboardLayoutView({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeDate = useDashboardStore((s) => s.activeDate);
  const setActiveDate = useDashboardStore((s) => s.setActiveDate);

  const cafeId = 'cafe-centralperk';
  const { isConnected } = useWebSocket(cafeId);

  const navItems = [
    { href: '/dashboard', label: 'Floorplan Visualizer', icon: LayoutDashboard },
    { href: '/dashboard/manifest', label: 'Shift Manifest', icon: ClipboardList },
    { href: '/dashboard/tables', label: 'Table Inventory', icon: Grid },
    { href: '/dashboard/setup', label: 'Setup Wizard', icon: Sparkles },
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-stone-800/80 bg-stone-900/60 backdrop-blur-xl flex flex-col justify-between p-4 shrink-0">
        <div>
          {/* Logo & Cafe Badge */}
          <div className="flex items-center justify-between pb-6 border-b border-stone-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center font-black text-stone-950 text-lg shadow-md shadow-amber-500/20">
                nB
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-stone-100 block">Host Stand</span>
                <span className="text-[11px] text-stone-400 font-medium">Central Perk Cafe</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                      : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* WebSocket Connection Status */}
        <div className="pt-4 border-t border-stone-800/80 flex items-center justify-between text-xs">
          <span className="text-stone-400">Live Sync:</span>
          {isConnected ? (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <Wifi className="w-3.5 h-3.5" /> Socket Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400 font-semibold">
              <WifiOff className="w-3.5 h-3.5" /> Polling Mode
            </span>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-stone-800/80 bg-stone-900/40 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-xs uppercase font-bold tracking-wider text-stone-400">Shift Date:</span>
            <input
              type="date"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
              className="bg-stone-800 border border-stone-700 text-stone-100 text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex items-center gap-3">
            <Badge status="ACTIVE" className="text-xs">
              Tenant Active
            </Badge>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
