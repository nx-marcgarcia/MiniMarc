'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { setHoyFocus } from '@/app/actions/focus';
import { toggleDone } from '@/app/actions/items';
import { InsetList, Toast, type ToastProps } from '@/components/ui';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item } from '@/lib/db/types';
import { formatDue } from '@/lib/format';
import { estimateOf, QUICK_MINUTES, type HoyPicks as Picks } from '@/lib/hoy/picks';

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** One row of a choosing block: title, why it is there, and its buttons on the right. */
function PickRow({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="ui-row">
      <span className="ui-row__body">
        <span className="ui-row__text">
          <span className="ui-row__title">{title}</span>
          {subtitle && <span className="ui-row__subtitle">{subtitle}</span>}
        </span>
        <span className="app-review__actions">{children}</span>
      </span>
    </div>
  );
}

const minutes = (item: Item) => {
  const m = estimateOf(item);
  return m === null ? undefined : `${m} min`;
};

/**
 * Hoy's choosing blocks: «Tu prioridad» (one task Marc picked today, or the list to pick it from)
 * and «Si tienes 15 minutos» (the short ones). No AI: the lists come from what the tasks say about
 * themselves. Every action reloads Hoy.
 */
export function HoyPicks({ picks, today }: { picks: Picks; today: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  function act(call: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await settle(call, OFFLINE);
      if (!result.ok) {
        toastId.current += 1;
        setToast({ id: toastId.current, message: result.error });
        return;
      }
      setChoosing(false);
      router.refresh();
    });
  }

  const { priority, quick, choices } = picks;
  const when = (item: Item) => formatDue(item, today).day;
  return (
    <>
      {priority ? (
        <InsetList header="Tu prioridad de hoy">
          <PickRow title={priority.title} subtitle={when(priority)}>
            <button type="button" className="app-btn app-btn--primary" aria-label={`Hecho: ${priority.title}`} onClick={() => act(() => toggleDone(priority.id))}>
              Hecho
            </button>
            <button type="button" className="app-btn app-btn--ghost" aria-label={`Quitar la prioridad: ${priority.title}`} onClick={() => act(() => setHoyFocus(null))}>
              Quitar
            </button>
          </PickRow>
        </InsetList>
      ) : (
        choices.length > 0 && (
          <InsetList header="Tu prioridad de hoy" footer={choosing ? undefined : 'Elige una sola cosa que, si la haces, el día habrá valido la pena.'}>
            {choosing ? (
              choices.map((item) => (
                <PickRow key={item.id} title={item.title} subtitle={when(item)}>
                  <button type="button" className="app-btn app-btn--tint" aria-label={`Elegir como prioridad: ${item.title}`} onClick={() => act(() => setHoyFocus(item.id))}>
                    Elegir
                  </button>
                </PickRow>
              ))
            ) : (
              <button type="button" className="ui-row app-action" onClick={() => setChoosing(true)}>
                Elegir mi prioridad de hoy
              </button>
            )}
          </InsetList>
        )
      )}

      {quick.length > 0 && (
        <InsetList header={`Si tienes ${QUICK_MINUTES} minutos`}>
          {quick.map((item) => (
            <PickRow key={item.id} title={item.title} subtitle={[minutes(item), when(item)].filter(Boolean).join(' · ')}>
              <button type="button" className="app-btn app-btn--tint" aria-label={`Hecho: ${item.title}`} onClick={() => act(() => toggleDone(item.id))}>
                Hecho
              </button>
              <button type="button" className="app-btn app-btn--ghost" aria-label={`Mi prioridad: ${item.title}`} onClick={() => act(() => setHoyFocus(item.id))}>
                Mi prioridad
              </button>
            </PickRow>
          ))}
        </InsetList>
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
