import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ArchivoScreen } from '@/components/archivo/ArchivoScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readArchivo } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Archivo' };

export default function ArchivoPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Archivo" rows={8} />}>
      <Archivo />
    </Suspense>
  );
}

async function Archivo() {
  return <ArchivoScreen items={await readArchivo()} />;
}
