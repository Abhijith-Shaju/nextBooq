import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Search, Sparkles, MapPin } from 'lucide-react';

export default function MarketplacePlaceholderPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-lg bg-stone-900/90 border-stone-800 text-center">
        <CardHeader>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-2">
            <Search className="w-7 h-7" />
          </div>
          <CardTitle className="text-2xl font-black">Consumer Marketplace Hub</CardTitle>
          <CardDescription>Phase 2 Future Scope (B2B2C Cafe Discovery & Geospatial Search)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-stone-800/50 border border-stone-700/80 text-xs text-stone-300 flex items-start gap-3 text-left">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-stone-100 block mb-1">Architecture Reserved</span>
              This placeholder route scope (`(marketplace)/search`) is ready to host real-time geospatial search (`/api/v1/search/cafes`) and localized availability queries when B2B2C marketplace features are activated.
            </div>
          </div>

          <Link href="/">
            <Button variant="secondary" className="w-full font-semibold">
              Return to Platform Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
