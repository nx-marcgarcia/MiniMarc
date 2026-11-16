import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BANDEJA_VIEWS, ViewSwitch } from '@/components/app/ViewSwitch';
import { AreaFilter } from '@/components/app/AreaFilter';
import { currentAreaFilter } from '@/lib/areaServer';
import { InboxScreen } from '@/components/items/InboxScreen';
import { InboxFallback } from '@/components/items/ScreenFallback';
import { readRecent } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Bandeja' };

type SearchParams = Promise<{ guardado?: string | string[]; area?: string | string[] }>;

export default function BandejaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<InboxFallback />}>
      <Bandeja searchParams={searchParams} />
    </Suspense>
  );
}

async function Bandeja({ searchParams }: { searchParams: SearchParams }) {
  // Where an Android share was saved (/compartir redirects here with ?guardado=).
  const [{ personal, trabajo, people, photos, today }, params] = await Promise.all([readRecent(), searchParams]);
  const { guardado } = params;
  const area = await currentAreaFilter(params);
  const notice = typeof guardado === 'string' ? guardado.slice(0, 200) : undefined;
  return (
    <InboxScreen
      today={today}
      personal={area === 'trabajo' ? [] : personal}
      trabajo={area === 'personal' ? [] : trabajo}
      people={people}
      photos={photos}
      notice={notice}
      before={
        <>
          <ViewSwitch label="Bandeja" options={BANDEJA_VIEWS} current="/bandeja" />
          <AreaFilter value={area} />
        </>
      }
    />
  );
}
