'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { deleteItem, moveItem, undoDelete } from '@/app/actions/items';
import { LinkText } from '@/components/links/LinkText';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import type { MovePatch } from '@/lib/actions/items';
import { settle, type ActionResult } from '@/lib/actions/result';
import { acceptPatch, processKey, suggestionText, undoAcceptPatch } from '@/lib/bandeja';
import type { Item, ItemType, Person } from '@/lib/db/types';
import { TYPE_LABELS } from '@/lib/format';
import { ITEM_TYPE_IDS } from '@/lib/items/itemTypes';
import type { PhotoMap } from '@/lib/photos/view';
import { ItemSheet, type SheetMode } from './ItemSheet';

export type BandejaScreenProps = {
  /** Madrid "YYYY-MM-DD" (kept for symmetry with the other list screens). */
  today: string;
  /** What is waiting for review (needsReview), newest first. */
  items: Item[];
  people: Person[];
  photos?: PhotoMap;
  /** Content between the title and the list (the Personal / Trabajo selector). */
  before?: ReactNode;
};

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const EDITABLE = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** The text Marc wrote, when it says more than the title. */
function original(item: Item): string | null {
  const source = item.sourceText?.trim();
  return source && source !== item.title.trim() ? source : null;
}

/**
 * The Bandeja: what the capture was not sure about, each with what the AI thinks it is. Accept the
 * suggestion, pick another type, or discard (to the Papelera), all with Deshacer; tap a row for the
 * full edit sheet. "Procesar" goes one by one with the keyboard (A accept, D discard, S skip,
 * 1…7 type, Esc leave), so emptying it takes a minute.
 */
export function BandejaScreen({ items, people, photos = {}, before }: BandejaScreenProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /** Handled items, hidden at once; they come back if the write fails or is undone. */
  const [gone, setGone] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [index, setIndex] = useState(0);
  const [sheet, setSheet] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const visible = items.filter((i) => !gone.includes(i.id));
  const current = visible.length > 0 ? visible[((index % visible.length) + visible.length) % visible.length] : null;

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? 'Deshacer' : undefined,
      onAction: undo ? () => startTransition(async () => void (await undo())) : undefined,
    });
  }

  /** Hides the item, runs the write, and offers to undo it; the item returns if the write fails. */
  function resolve(item: Item, action: () => Promise<ActionResult<unknown>>, message: string, undo: () => Promise<ActionResult<unknown>>) {
    setGone((g) => [...g, item.id]);
    startTransition(async () => {
      const result = await settle(action, OFFLINE);
      if (!result.ok) {
        setGone((g) => g.filter((id) => id !== item.id));
        return showToast(result.error);
      }
      showToast(message, async () => {
        const back = await settle(undo, OFFLINE);
        if (back.ok) {
          setGone((g) => g.filter((id) => id !== item.id));
          router.refresh();
        } else showToast(back.error);
        return back;
      });
    });
  }

  function accept(item: Item, type?: ItemType) {
    const patch = acceptPatch(item, type);
    resolve(item, () => moveItem(item.id, patch), `Guardado en ${TYPE_LABELS[patch.type as ItemType]}`, () => moveItem(item.id, undoAcceptPatch(item)));
  }
  const discard = (item: Item) => resolve(item, () => deleteItem(item.id), 'Eliminado', () => undoDelete(item.id));
  const archive = (item: Item) =>
    resolve(item, () => moveItem(item.id, { archived: true, needsReview: false }), 'Archivado', () => moveItem(item.id, { archived: false, needsReview: true }));

  // The keyboard of "Procesar". Not while typing in a field or with the edit sheet open.
  useEffect(() => {
    if (!processing || sheet.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.isComposing || EDITABLE.has((e.target as HTMLElement | null)?.tagName ?? '')) return;
      const action = processKey(e);
      if (!action) return;
      e.preventDefault();
      if (action.kind === 'exit') return setProcessing(false);
      if (!current) return;
      if (action.kind === 'accept') accept(current);
      else if (action.kind === 'type') accept(current, action.type);
      else if (action.kind === 'discard') discard(current);
      else if (action.kind === 'skip') setIndex((i) => i + 1);
      else if (action.kind === 'back') setIndex((i) => i - 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // accept/discard close over `current` and the setters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, sheet.open, current]);

  function save(item: Item, patch: MovePatch): Promise<ActionResult<null>> {
    setSheet((s) => ({ ...s, open: false }));
    resolve(item, () => moveItem(item.id, patch), 'Guardado', () => moveItem(item.id, undoAcceptPatch(item)));
    return Promise.resolve({ ok: true, value: null });
  }

  const mode: SheetMode = sheet.item ? { kind: 'edit', item: sheet.item } : { kind: 'new', defaults: { type: 'tarea', label: '' } };

  return (
    <>
      <LargeTitle
        title="Bandeja"
        trailing={
          visible.length > 0 && !processing ? (
            <button type="button" className="app-btn app-btn--primary" onClick={() => { setIndex(0); setProcessing(true); }}>
              Procesar
            </button>
          ) : undefined
        }
      >
        {before}

        {processing ? (
          <section className="ui-glass app-bandeja-process" role="region" aria-label="Procesar la Bandeja">
            {current ? (
              <>
                <p className="app-bandeja-process__count">{`${(((index % visible.length) + visible.length) % visible.length) + 1} de ${visible.length}`}</p>
                <h2 className="app-bandeja-process__title">
                  <LinkText text={current.title} />
                </h2>
                {original(current) && <p className="app-bandeja-process__source">{original(current)}</p>}
                {suggestionText(current) && <p className="app-bandeja-process__hint">La IA cree: {suggestionText(current)}</p>}
                <div className="app-bandeja-process__types" role="group" aria-label="Tipo">
                  {ITEM_TYPE_IDS.map((t, n) => (
                    <button key={t} type="button" className="app-chip" aria-label={`${TYPE_LABELS[t]} (${n + 1})`} onClick={() => accept(current, t)}>
                      {n + 1} · {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <div className="app-bandeja-process__actions">
                  <button type="button" className="app-btn app-btn--primary" onClick={() => accept(current)}>
                    Aceptar (A)
                  </button>
                  <button type="button" className="app-btn app-btn--tint" onClick={() => setIndex((i) => i + 1)}>
                    Saltar (S)
                  </button>
                  <button type="button" className="app-btn app-btn--tint" onClick={() => discard(current)}>
                    Descartar (D)
                  </button>
                  <button type="button" className="app-btn app-btn--tint" onClick={() => setProcessing(false)}>
                    Salir (Esc)
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="app-bandeja-process__title">Bandeja vacía</h2>
                <button type="button" className="app-btn app-btn--primary" onClick={() => setProcessing(false)}>
                  Salir
                </button>
              </>
            )}
          </section>
        ) : visible.length === 0 ? (
          <p className="app-empty">Todo está clasificado. Lo que la IA no tenga claro aparecerá aquí con una sugerencia, por ejemplo al escribir solo «Trabajar».</p>
        ) : (
          <InsetList header="Para revisar" footer="Acepta lo que sugiere la IA, elige otro tipo o descártalo. Toca un elemento para editarlo.">
            {visible.map((item) => (
              <div key={item.id} className="ui-row app-bandeja-row">
                <div className="ui-row__body app-press">
                  <button type="button" className="app-press__hit" aria-label={`Abrir «${item.title}»`} onClick={() => setSheet({ open: true, item })} />
                  <span className="ui-row__text">
                    <span className="ui-row__title">
                      <LinkText text={item.title} />
                    </span>
                    {suggestionText(item) && <span className="ui-row__subtitle">{suggestionText(item)}</span>}
                    {original(item) && <span className="ui-row__subtitle">{original(item)}</span>}
                  </span>
                </div>
                <div className="app-bandeja-row__actions">
                  {item.suggestion && (
                    <button type="button" className="app-btn app-btn--primary" aria-label={`Aceptar «${item.title}»`} onClick={() => accept(item)}>
                      Aceptar
                    </button>
                  )}
                  <select
                    className="app-chip"
                    aria-label={`Cambiar el tipo de «${item.title}»`}
                    value=""
                    onChange={(e) => e.target.value && accept(item, e.target.value as ItemType)}
                  >
                    <option value="">Tipo…</option>
                    {ITEM_TYPE_IDS.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="app-btn app-btn--tint" aria-label={`Descartar «${item.title}»`} onClick={() => discard(item)}>
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </InsetList>
        )}
      </LargeTitle>

      <ItemSheet
        open={sheet.open}
        mode={mode}
        people={people}
        photos={sheet.item ? photos[sheet.item.id] : undefined}
        reviewMode
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        onCreate={async () => ({ ok: false, error: OFFLINE })}
        onSave={save}
        onComplete={(item) => accept(item)}
        onArchive={(item) => (setSheet((s) => ({ ...s, open: false })), archive(item))}
        onDelete={(item) => (setSheet((s) => ({ ...s, open: false })), discard(item))}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
