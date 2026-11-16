import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BANDEJA_VIEWS, ViewSwitch } from '@/components/app/ViewSwitch';
import { AreaFilter } from '@/components/app/AreaFilter';
import { BandejaScreen } from '@/components/items/BandejaScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readSinClasificar } from '@/lib/cache/reads';
import { currentAreaFilter } from '@/lib/areaServer';

export const metadata: Metadata = { title: 'Bandeja' };

type SearchParams = Promise<{ area?: string | string[] }>;

export default function BandejaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ScreenFallback title="Bandeja" segmented check />}>
      <Bandeja searchParams={searchParams} />
    </Suspense>
  );
}

/** Bandeja, "Por revisar" view: what the capture was not sure about (route kept as /sin-clasificar: Siri, bookmarks and the extension link to it). */
async function Bandeja({ searchParams }: { searchParams: SearchParams }) {
  // Personal and Trabajo are separate views, as on /tareas: they never share a list.
  const area = await currentAreaFilter(await searchParams);
  const { items, people, photos, today } = await readSinClasificar(area);
  return (
    <BandejaScreen
      key={area}
      today={today}
      items={items}
      people={people}
      photos={photos}
      before={
        <>
          <ViewSwitch label="Bandeja" options={BANDEJA_VIEWS} current="/sin-clasificar" />
          <AreaFilter value={area} />
        </>
      }
    />
  );
}
