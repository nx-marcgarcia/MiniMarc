import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { RevisionScreen } from '@/components/revision/RevisionScreen';
import { readRevision } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Revisión semanal' };

export default function RevisionPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Revisión semanal" sections={['1. Bandeja a cero', '2. Proyectos', '3. Atrasado']} />}>
      <Revision />
    </Suspense>
  );
}

async function Revision() {
  const { review, today, tz } = await readRevision();
  return <RevisionScreen review={review} today={today} tz={tz} />;
}
