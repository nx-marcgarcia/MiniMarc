'use client';

import { useEffect, useState } from 'react';
import { InsetList, Row } from '@/components/ui';
import { REVIEW_KEY, reviewDue } from '@/lib/revision';

/** On Mondays, Hoy says it is time for the weekly review (unless it was done this week on this device). */
export function ReviewReminder({ tz, now }: { tz: string; now?: Date }) {
  const [due, setDue] = useState(false);
  useEffect(() => {
    // localStorage only exists in the browser: decided after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDue(reviewDue(localStorage.getItem(REVIEW_KEY), now ?? new Date(), tz));
  }, [tz, now]);
  if (!due) return null;
  return (
    <InsetList>
      <Row href="/revision" title="Toca revisión semanal" subtitle="Bandeja a cero, proyectos y lo olvidado: diez minutos" />
    </InsetList>
  );
}
