'use client';

import { useState, useTransition } from 'react';
import { setDigestHour } from '@/app/actions/settings';
import { InsetList, Row } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { DIGEST_HOURS } from '@/lib/db/settings';

export type DigestSectionProps = {
  /** Null while loading. */
  hour: number | null;
  tz: string | null;
};

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Ajustes → "Resumen de la mañana": hour of the briefing (9–11, inside the Mon-Fri window) and the time zone it uses. */
export function DigestSection({ hour, tz }: DigestSectionProps) {
  const [value, setValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // An hour saved before the window existed (6 to 8) is shown as what it now means: 9:00.
  const current = value ?? (hour === null ? null : Math.max(hour, DIGEST_HOURS[0]));

  function change(next: number) {
    const previous = current;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const r = await settle(() => setDigestHour(next), 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.');
      if (!r.ok) {
        setValue(previous);
        setError(r.error);
      }
    });
  }

  return (
    <InsetList header="Resumen de la mañana" footer={error ?? 'Un aviso cada día laborable con citas, tareas, cumpleaños y una cosa rescatada. Se abre en Hoy.'}>
      <Row
        title="Hora"
        trailing={
          <select
            className="app-select"
            aria-label="Hora del resumen"
            value={current ?? ''}
            disabled={current === null || pending}
            onChange={(e) => change(Number(e.target.value))}
          >
            {current === null && <option value="">—</option>}
            {DIGEST_HOURS.map((h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        }
      />
      <Row title="Zona horaria" detail={tz ?? undefined} />
    </InsetList>
  );
}
