import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PERSONAS_VIEWS, ViewSwitch } from '@/components/app/ViewSwitch';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { OccasionsSection } from '@/components/items/OccasionsSection';
import { PeopleSection } from '@/components/items/PeopleSection';
import { ScreenFallback } from '@/components/items/ScreenFallback';
import { readRegalos } from '@/lib/cache/reads';
import { giftSummary } from '@/lib/regalos';

export const metadata: Metadata = { title: 'Regalos' };

export default function RegalosPage() {
  return (
    <Suspense fallback={<ScreenFallback title="Regalos" segmented check />}>
      <Regalos />
    </Suspense>
  );
}

async function Regalos() {
  const { people, unassigned, occasions, photos, today } = await readRegalos();
  return (
    <ItemsScreen
      title="Regalos"
      today={today}
      before={
        <>
          <ViewSwitch label="Vista" options={PERSONAS_VIEWS} current="/regalos" />
          <OccasionsSection occasions={occasions} />
          <PeopleSection
            groups={people
              .filter((g) => g.items.length > 0)
              .map((g) => ({ person: g.person, count: g.items.length, summary: giftSummary(g.items) }))}
          />
        </>
      }
      sections={[{ key: 'sin-persona', header: 'Sin persona', items: unassigned }]}
      people={people.map((g) => g.person)}
      newItem={{ type: 'regalo', label: 'Nuevo regalo' }}
      photos={photos}
    />
  );
}
