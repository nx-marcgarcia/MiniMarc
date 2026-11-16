'use client';

import { useState, useTransition } from 'react';
import { addSuggestedGift, suggestGiftIdeas } from '@/app/actions/regalos';
import { InsetList, Row } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { formatMoney } from '@/lib/compras';
import type { GiftSuggestion } from '@/lib/giftIdeas';

const OFFLINE = 'No se ha podido conectar. Inténtalo de nuevo.';

/**
 * "Sugerir ideas": asks the AI (one call per press) for gift ideas for this person and lets Marc
 * keep the ones he likes as regalo ideas. People of Trabajo never get this button (see the page).
 */
export function GiftSuggestions({ personId, occasion }: { personId: string; occasion?: string }) {
  const [pending, startTransition] = useTransition();
  const [ideas, setIdeas] = useState<GiftSuggestion[] | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function suggest() {
    setError(null);
    startTransition(async () => {
      const r = await settle(() => suggestGiftIdeas(personId, occasion), OFFLINE);
      if (r.ok) {
        setIdeas(r.value);
        setAdded([]);
      } else setError(r.error);
    });
  }

  function keep(s: GiftSuggestion) {
    setError(null);
    startTransition(async () => {
      const r = await settle(() => addSuggestedGift(personId, s), OFFLINE);
      if (r.ok) setAdded((a) => [...a, s.title]);
      else setError(r.error);
    });
  }

  return (
    <section className="app-suggest">
      <button type="button" className="app-btn app-btn--tint" onClick={suggest} disabled={pending}>
        {pending && ideas === null ? 'Pensando…' : ideas ? 'Otras ideas' : 'Sugerir ideas'}
      </button>
      {error && (
        <p role="alert" className="app-warn">
          {error}
        </p>
      )}
      {ideas && ideas.length === 0 && !error && <p className="app-empty">No se me ocurre nada nuevo. Añade gustos a su ficha y vuelve a probar.</p>}
      {ideas && ideas.length > 0 && (
        <InsetList header="Ideas sugeridas">
          {ideas.map((s) => (
            <Row
              key={s.title}
              title={s.title}
              subtitle={[s.reason, s.approxPrice ? `≈ ${formatMoney(s.approxPrice, 'EUR')}` : null].filter(Boolean).join(' · ') || undefined}
              trailing={
                added.includes(s.title) ? (
                  <span aria-live="polite">Añadida</span>
                ) : (
                  <button type="button" className="app-btn app-btn--primary" aria-label={`Añadir «${s.title}»`} onClick={() => keep(s)} disabled={pending}>
                    Añadir
                  </button>
                )
              }
            />
          ))}
        </InsetList>
      )}
    </section>
  );
}
