import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BANDEJA_VIEWS, ViewSwitch } from '@/components/app/ViewSwitch';
import { AreaSelector } from '@/components/items/AreaSelector';
import { BandejaScreen } from '@/components/items/BandejaScreen';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readSinClasificar } from '@/lib/cache/reads';
import type { Area } from '@/lib/db/types';

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
  const area: Area = (await searchParams).area === 'trabajo' ? 'trabajo' : 'personal';
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
          <AreaSelector area={area} basePath="/sin-clasificar" />
        </>
      }
    />
  );
}
