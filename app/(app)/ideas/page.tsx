import type { Metadata } from 'next';
import { Suspense } from 'react';
import { IdeasScreen } from '@/components/ideas/IdeasScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readIdeas } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Ideas' };

export default function IdeasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Ideas" />}>
      <Ideas />
    </Suspense>
  );
}

async function Ideas() {
  const { ideas } = await readIdeas();
  return <IdeasScreen ideas={ideas} />;
}
