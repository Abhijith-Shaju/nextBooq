import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Calendar, Store, Clock, MapPin, Phone } from 'lucide-react';

interface TenantLandingPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function TenantLandingPage({ params }: TenantLandingPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.tenant || 'centralperk';
  const cafeName = slug.charAt(0).toUpperCase() + slug.slice(1) + ' Cafe';

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-xl bg-stone-900/90 border-stone-800 text-center shadow-2xl">
        <CardHeader>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-stone-950 font-black text-2xl mx-auto mb-3 shadow-lg shadow-amber-500/20">
            {slug.substring(0, 2).toUpperCase()}
          </div>
          <CardTitle className="text-3xl font-black">{cafeName}</CardTitle>
          <CardDescription className="text-stone-400">
            Welcome to our official booking portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-left text-xs bg-stone-800/60 p-4 rounded-xl border border-stone-700">
            <div className="flex items-center gap-2 text-stone-300">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Open 8:00 AM - 11:00 PM</span>
            </div>
            <div className="flex items-center gap-2 text-stone-300">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Downtown City Center</span>
            </div>
          </div>

          <Link href={`/${slug}/book`}>
            <Button variant="secondary" size="lg" className="w-full font-extrabold py-3">
              <Calendar className="w-5 h-5" /> Reserve a Table Now
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
