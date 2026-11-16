import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PersonasFallback } from '@/components/items/ScreenFallback';
import { ProyectosScreen } from '@/components/proyectos/ProyectosScreen';
import { currentAreaFilter } from '@/lib/areaServer';
import { readProyectos } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Proyectos' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function ProyectosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PersonasFallback title="Proyectos" />}>
      <Proyectos searchParams={searchParams} />
    </Suspense>
  );
}

async function Proyectos({ searchParams }: { searchParams: SearchParams }) {
  const area = await currentAreaFilter(await searchParams);
  const { available, active, paused, done } = await readProyectos(area);
  return <ProyectosScreen area={area} available={available} active={active} paused={paused} done={done} />;
}
