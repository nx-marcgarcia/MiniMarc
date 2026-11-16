import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ComprasScreen } from '@/components/compras/ComprasScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readCompras } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Compras' };

export default function ComprasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Compras" check subtitle={false} />}>
      <Compras />
    </Suspense>
  );
}

async function Compras() {
  const { items, history, stores, photos, today } = await readCompras();
  return <ComprasScreen today={today} items={items} history={history} stores={stores} photos={photos} />;
}
