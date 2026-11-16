import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readByType } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Notas' };

export default function NotasPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Notas" />}>
      <Notas />
    </Suspense>
  );
}

/** Notes: what is worth keeping but is not something to do, buy or read. Newest first. */
async function Notas() {
  const { items, photos, today } = await readByType('nota');
  return (
    <ItemsScreen
      title="Notas"
      today={today}
      sections={[{ key: 'notas', items }]}
      photos={photos}
      emptyText="No hay notas. Lo que captures como nota (un dato, una contraseña de wifi, una receta) aparece aquí."
      newItem={{ type: 'nota', label: 'Nueva nota' }}
    />
  );
}
