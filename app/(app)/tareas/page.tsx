import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AreaFilter } from '@/components/app/AreaFilter';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { currentAreaFilter } from '@/lib/areaServer';
import { readTareas } from '@/lib/cache/reads';
import { groupTareas } from '@/lib/tareas';

export const metadata: Metadata = { title: 'Tareas' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function TareasPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Tareas" segmented check detail />}>
      <Tareas searchParams={searchParams} />
    </Suspense>
  );
}

const EMPTY = {
  personal: 'No hay tareas personales pendientes.',
  trabajo: 'No hay tareas de trabajo pendientes.',
  todo: 'No hay tareas pendientes.',
} as const;

async function Tareas({ searchParams }: { searchParams: SearchParams }) {
  const area = await currentAreaFilter(await searchParams);
  const { items, photos, today } = await readTareas(area);
  return (
    <ItemsScreen
      // A fresh screen per area: the lists never share state.
      key={area}
      title="Tareas"
      today={today}
      before={<AreaFilter value={area} />}
      sections={groupTareas(items, today).map((g) => ({ ...g, takesNew: g.key === 'sin-fecha' }))}
      syncNotices
      showArea={area === 'todo'}
      photos={photos}
      emptyText={EMPTY[area]}
      newItem={{ type: 'tarea', area: area === 'trabajo' ? 'trabajo' : 'personal', label: area === 'trabajo' ? 'Nueva tarea de trabajo' : 'Nueva tarea' }}
    />
  );
}
