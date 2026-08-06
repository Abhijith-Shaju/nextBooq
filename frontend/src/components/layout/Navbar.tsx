import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-800/80 bg-stone-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center font-black text-stone-950 text-xl shadow-lg shadow-amber-500/20">
            nB
          </div>
          <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-stone-100 via-stone-200 to-stone-400 bg-clip-text text-transparent">
            nextBooq
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-stone-400">
          <Link href="/" className="text-stone-100 transition-colors">Home</Link>
          <Link href="/pricing" className="hover:text-stone-100 transition-colors">Pricing</Link>
          <Link href="/onboarding/cafe" className="hover:text-stone-100 transition-colors">Setup Cafe</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/signup">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary" size="sm">Start Free Trial</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
