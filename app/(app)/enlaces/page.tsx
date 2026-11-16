import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EnlacesScreen } from '@/components/enlaces/EnlacesScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readEnlaces } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Enlaces' };

export default function EnlacesPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Enlaces" segmented />}>
      <Enlaces />
    </Suspense>
  );
}

async function Enlaces() {
  const { cards } = await readEnlaces();
  return <EnlacesScreen cards={cards} />;
}
