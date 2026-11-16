import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HoyScreen } from '@/components/hoy/HoyScreen';
import { HoyFallback } from '@/components/items/ScreenFallback';
import { currentAreaFilter } from '@/lib/areaServer';
import { readHoy, readParaHoy } from '@/lib/cache/reads';
import type { Settings } from '@/lib/db/settings';
import { FALLBACK_HEADLINE, generateHeadline } from '@/lib/digest/server';
import { createClient, requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Hoy' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function HoyPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<HoyFallback />}>
      <Hoy searchParams={searchParams} />
    </Suspense>
  );
}

async function Hoy({ searchParams }: { searchParams: SearchParams }) {
  const [{ digest, headlinePrompt, settings }, paraHoy, area] = await Promise.all([
    readHoy(),
    readParaHoy().catch(() => []),
    searchParams.then(currentAreaFilter),
  ]);
  // The AI line never holds the page: it streams in on its own when it is not cached yet.
  const headline = headlinePrompt ? (
    <Suspense fallback={<span className="app-headline-pending" aria-hidden />}>
      <Headline date={digest.date} settings={settings} prompt={headlinePrompt} />
    </Suspense>
  ) : undefined;
  return (
    <HoyScreen
      digest={digest}
      headline={headline}
      tz={settings.tz}
      vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? ''}
      paraHoy={paraHoy}
      area={area}
    />
  );
}

async function Headline({ date, settings, prompt }: { date: string; settings: Settings; prompt: string }) {
  const [user, client] = await Promise.all([requireUser(), createClient()]);
  return generateHeadline({ client, userId: user.id, key: date, settings, prompt, slot: 'day', fallback: FALLBACK_HEADLINE });
}
