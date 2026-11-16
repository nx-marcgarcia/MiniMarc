'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { resurfaceAct } from '@/app/actions/resurfacing';
import { InsetList, Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import type { ResurfaceAction } from '@/lib/db/resurfacing';
import type { Candidate } from '@/lib/resurfacing/candidates';
import { KIND_LABELS } from '@/lib/resurfacing/messages';

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/**
 * "Para hoy": what the brain would bring back right now (urgent first), with the same buttons the
 * Telegram notice has: Hecho, Posponer 1 semana, Archivar and Abrir. A row leaves at once and comes
 * back if the action fails. A person's date has no item, so it can only be postponed or opened.
 */
export function ParaHoy({ candidates }: { candidates: Candidate[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const shown = candidates.filter((c) => !gone.includes(c.subject));
  const say = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };

  async function act(c: Candidate, action: Exclude<ResurfaceAction, 'abrir'>) {
    setGone((g) => [...g, c.subject]);
    const result = await settle(() => resurfaceAct({ subject: c.subject, itemId: c.itemId, kind: c.kind }, action), OFFLINE);
    if (result.ok) return say(result.value);
    setGone((g) => g.filter((s) => s !== c.subject));
    say(result.error);
  }

  if (candidates.length === 0) return null;
  return (
    <>
      {shown.length > 0 && (
        <InsetList header="Para hoy">
          {shown.map((c) => (
            <div key={c.subject} className="ui-row app-resurface">
              <div className="app-resurface__body">
                <span className="app-resurface__title">{c.title}</span>
                <span className="app-resurface__meta">
                  {KIND_LABELS[c.kind]} · {c.detail}
                </span>
                {c.askArchive && <span className="app-resurface__ask">Lo has pospuesto 3 veces. ¿Lo archivo?</span>}
                <span className="app-resurface__actions">
                  {c.itemId && (
                    <button type="button" className="ui-bar-button" aria-label={`Hecho: ${c.title}`} onClick={() => void act(c, 'hecho')}>
                      Hecho
                    </button>
                  )}
                  <button type="button" className="ui-bar-button" aria-label={`Posponer 1 semana: ${c.title}`} onClick={() => void act(c, 'posponer')}>
                    Posponer 1 semana
                  </button>
                  {c.itemId && (
                    <button type="button" className="ui-bar-button" aria-label={`Archivar: ${c.title}`} onClick={() => void act(c, 'archivar')}>
                      Archivar
                    </button>
                  )}
                  <Link href={c.href} className="ui-bar-button" aria-label={`Abrir: ${c.title}`}>
                    Abrir
                  </Link>
                </span>
              </div>
            </div>
          ))}
        </InsetList>
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
