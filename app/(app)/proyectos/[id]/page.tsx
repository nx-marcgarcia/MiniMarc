import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { ProyectoScreen } from '@/components/proyectos/ProyectoScreen';
import { readProyecto } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Proyecto' };

type Params = Promise<{ id: string }>;

export default function ProyectoPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ScreenFallback title="" segmented rows={5} check />}>
      <Proyecto params={params} />
    </Suspense>
  );
}

async function Proyecto({ params }: { params: Params }) {
  const { id } = await params;
  const data = await readProyecto(id);
  if (!data) notFound();
  return <ProyectoScreen {...data} />;
}
