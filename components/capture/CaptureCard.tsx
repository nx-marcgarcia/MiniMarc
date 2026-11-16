'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { correctCapture, listCaptureChoices, mergeCaptureDuplicate, undoCapture } from '@/app/actions/captureFollowUp';
import { settle } from '@/lib/actions/result';
import type { Understood } from '@/lib/capture/describe';
import type { CorrectionPatch } from '@/lib/capture/followUp';
import type { UnderstoodCapture } from '@/lib/capture/web';
import type { ItemType } from '@/lib/db/types';
import { ITEM_TYPE_IDS, ITEM_TYPES } from '@/lib/items/itemTypes';
import { BANDEJA_HREF } from '@/lib/nav';

export type CaptureCardData = { id: number; message: string; understood: UnderstoodCapture };

type Choices = { people: { id: string; name: string }[]; stores: { id: string; name: string }[] };
const NO_CHOICES: Choices = { people: [], stores: [] };

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
/** How long the card waits before it goes away by itself (it stays while Marc is on it). */
const DURATION_MS = 15_000;
const MAX_CHIP_ROWS = 4;

/** Options of a chip, with the current value always among them (the lists may still be loading). */
function withCurrent(list: { id: string; name: string }[], id: string | null, name?: string) {
  return id && !list.some((o) => o.id === id) ? [{ id, name: name ?? '…' }, ...list] : list;
}

/**
 * What the capture understood, with the way to fix it: the lines ("2 compras en Aliexpress"), a row
 * of chips per item (type, and person for a gift or store for a purchase: one tap, no sheet), a warning
 * when something looks like a repeat, and Deshacer / Editar. Corrections go to the server and to the
 * classification log; one that fails puts the chip back and says so. Stays while hovered or focused.
 */
export function CaptureCard({ data, onClose, onNotice }: { data: CaptureCardData; onClose: () => void; onNotice: (message: string) => void }) {
  const router = useRouter();
  const { understood } = data;
  const [items, setItems] = useState<Understood[]>(understood.items);
  const [choices, setChoices] = useState<Choices>(NO_CHOICES);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const busy = useRef(false);

  // Person and store lists are only needed for gifts and purchases.
  const needChoices = items.some((i) => i.type === 'regalo' || i.type === 'compra');
  useEffect(() => {
    if (!needChoices) return;
    let live = true;
    settle(() => listCaptureChoices(), '').then((r) => {
      if (live && r.ok) setChoices(r.value);
    });
    return () => {
      live = false;
    };
  }, [needChoices]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(onClose, DURATION_MS);
    return () => clearTimeout(t);
  }, [paused, onClose]);

  async function change(item: Understood, patch: CorrectionPatch, apply: (i: Understood) => Understood) {
    const before = items;
    setError(null);
    setItems((all) => all.map((i) => (i.id === item.id ? apply(i) : i)));
    const result = await settle(() => correctCapture({ ...(understood.logId && { logId: understood.logId }), itemId: item.id, patch }), OFFLINE);
    if (!result.ok) {
      setItems(before);
      setError(result.error);
    }
  }

  async function undo() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    const result = await settle(() => undoCapture({ itemIds: items.map((i) => i.id), eventIds: understood.eventIds }), OFFLINE);
    busy.current = false;
    if (!result.ok) return setError(result.error);
    onClose();
    onNotice(result.value.eventsFailed > 0 ? 'Deshecho, pero alguna cita sigue en Calendar' : 'Captura deshecha');
  }

  async function merge(item: Understood) {
    if (!item.duplicateOf) return;
    setError(null);
    const result = await settle(() => mergeCaptureDuplicate(item.id, item.duplicateOf as string), OFFLINE);
    if (!result.ok) return setError(result.error);
    setItems((all) => all.filter((i) => i.id !== item.id));
  }

  const shown = items.slice(0, MAX_CHIP_ROWS);
  const repeats = items.filter((i) => i.duplicateOf && !kept.includes(i.id));

  return (
    <div
      className="ui-toast app-capture-card"
      role="group"
      aria-label="Captura guardada"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <ul className="app-capture-card__lines">
        {understood.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {shown.length > 0 && (
        <ul className="app-capture-card__items">
          {shown.map((item) => (
            <li key={item.id} className="app-capture-card__item">
              <span className="app-capture-card__title">{item.title}</span>
              <span className="app-capture-card__chips">
                <select
                  className="app-chip"
                  aria-label={`Tipo de «${item.title}»`}
                  value={item.type}
                  onChange={(e) => {
                    const type = e.target.value as ItemType;
                    void change(item, { type }, (i) => ({ ...i, type, needsReview: false }));
                  }}
                >
                  {ITEM_TYPE_IDS.map((t) => (
                    <option key={t} value={t}>
                      {ITEM_TYPES[t].label}
                    </option>
                  ))}
                </select>
                {item.type === 'regalo' && (
                  <select
                    className="app-chip"
                    aria-label={`Persona de «${item.title}»`}
                    value={item.personId ?? ''}
                    onChange={(e) => {
                      const personId = e.target.value || null;
                      const personName = choices.people.find((p) => p.id === personId)?.name;
                      void change(item, { personId }, (i) => ({ ...i, personId, personName }));
                    }}
                  >
                    <option value="">Sin persona</option>
                    {withCurrent(choices.people, item.personId, item.personName).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                {item.type === 'compra' && (
                  <select
                    className="app-chip"
                    aria-label={`Tienda de «${item.title}»`}
                    value={item.storeId ?? ''}
                    onChange={(e) => {
                      const storeId = e.target.value || null;
                      const storeName = choices.stores.find((s) => s.id === storeId)?.name;
                      void change(item, { storeId }, (i) => ({ ...i, storeId, storeName }));
                    }}
                  >
                    <option value="">Sin tienda</option>
                    {withCurrent(choices.stores, item.storeId, item.storeName).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </li>
          ))}
          {items.length > shown.length && <li className="app-capture-card__more">y {items.length - shown.length} más en Recién añadido</li>}
        </ul>
      )}

      {repeats.map((item) => (
        <div key={item.id} className="app-capture-card__repeat">
          <span>Ya tenías algo parecido</span>
          <span className="app-capture-card__repeat-title">«{item.title}»</span>
          <button type="button" className="app-btn app-btn--primary" onClick={() => void merge(item)}>
            Es el mismo
          </button>
          <button type="button" className="app-btn app-btn--tint" onClick={() => setKept((k) => [...k, item.id])}>
            Mantener ambos
          </button>
        </div>
      ))}

      {error && (
        <p className="app-capture-card__error" role="alert">
          {error}
        </p>
      )}

      <div className="app-capture-card__actions">
        <button type="button" className="app-btn app-btn--primary" onClick={() => void undo()}>
          Deshacer
        </button>
        <button
          type="button"
          className="app-btn app-btn--tint"
          onClick={() => {
            router.push(BANDEJA_HREF);
            onClose();
          }}
        >
          Editar
        </button>
        <button type="button" className="app-btn app-btn--ghost" aria-label="Cerrar" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
