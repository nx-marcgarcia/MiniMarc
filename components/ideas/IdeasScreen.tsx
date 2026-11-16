'use client';

import { useRef, useState, useTransition } from 'react';
import { addItem, deleteItem, moveItem, toggleDone, undoDelete } from '@/app/actions/items';
import { ItemSheet, type SheetMode } from '@/components/items/ItemSheet';
import { IdeaIcon, PlusIcon } from '@/components/icons';
import { InsetList, LargeTitle, Segmented, Toast, type ToastProps } from '@/components/ui';
import type { MovePatch } from '@/lib/actions/items';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item } from '@/lib/db/types';
import { categoriesIn, filterIdeas, IDEA_MOVED_TO, IDEA_NEXT, sortIdeas, tagsIn } from '@/lib/ideas';
import { ITEM_TYPES } from '@/lib/items/itemTypes';
import { stars } from '@/lib/libros';

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
const NEW_IDEA = { type: 'idea', label: 'Nueva idea' } as const;

const STATES = ITEM_TYPES.idea.states.map((s) => ({ value: s.id, label: s.id === 'descartada' ? 'Descartadas' : s.label }));

/**
 * Ideas, laid out like Libros: a segmented control per state (semilla · explorando · en marcha · descartadas),
 * rows with category, potential and next step, and a text button at the end that moves the idea on
 * (Explorar → Arrancar; Recuperar brings a discarded one back). Category and tag filters show when there is a choice.
 */
export function IdeasScreen({ ideas }: { ideas: Item[] }) {
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState(() => STATES.find((st) => ideas.some((i) => !i.archived && i.status === st.value))?.value ?? 'semilla');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  /** Optimistic states: the new state shows at once and goes away if the write fails. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ open: boolean; mode: SheetMode }>({ open: false, mode: { kind: 'new', defaults: NEW_IDEA } });
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const current = ideas.map((i) => (overrides[i.id] ? { ...i, status: overrides[i.id] } : i));
  const categories = categoriesIn(current);
  const tags = tagsIn(current);
  const shown = sortIdeas(filterIdeas(current, { status: tab, category: category || undefined, tag: tag || undefined }));

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? 'Deshacer' : undefined,
      onAction: undo ? () => startTransition(async () => void (await run(undo))) : undefined,
    });
  }

  async function run(fn: () => Promise<ActionResult<unknown>>): Promise<boolean> {
    const result = await settle(fn, OFFLINE);
    if (!result.ok) showToast(result.error);
    return result.ok;
  }

  function changeState(item: Item, next: string) {
    const previous = item.status;
    setOverrides((o) => ({ ...o, [item.id]: next }));
    startTransition(async () => {
      const ok = await run(() => moveItem(item.id, { status: next }));
      if (!ok) setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== item.id)));
      else
        showToast(IDEA_MOVED_TO[next] ?? 'Movida', async () => {
          setOverrides((o) => ({ ...o, [item.id]: previous }));
          return moveItem(item.id, { status: previous });
        });
    });
  }

  const closeSheet = () => setSheet((s) => ({ ...s, open: false }));
  const fromSheet = (item: Item, then: (item: Item) => void) => (closeSheet(), then(item));

  const complete = (item: Item) =>
    startTransition(async () => {
      if (await run(() => toggleDone(item.id))) showToast('Marcada en marcha', () => toggleDone(item.id));
    });
  const archive = (item: Item) =>
    startTransition(async () => {
      if (await run(() => moveItem(item.id, { archived: true }))) showToast('Archivada', () => moveItem(item.id, { archived: false }));
    });
  const remove = (item: Item) =>
    startTransition(async () => {
      if (await run(() => deleteItem(item.id))) showToast('Eliminada', () => undoDelete(item.id));
    });

  function create(fd: FormData): Promise<ActionResult<null>> {
    startTransition(async () => void (await run(() => addItem(fd))));
    return Promise.resolve({ ok: true, value: null });
  }

  function save(item: Item, patch: MovePatch): Promise<ActionResult<null>> {
    startTransition(async () => void (await run(() => moveItem(item.id, patch))));
    return Promise.resolve({ ok: true, value: null });
  }

  return (
    <>
      <LargeTitle
        title="Ideas"
        trailing={
          <button
            type="button"
            className="ui-bar-button"
            aria-label={NEW_IDEA.label}
            title="Formulario manual. Para escribir y que la IA lo ordene, usa la barra «Apunta algo»"
            onClick={() => setSheet({ open: true, mode: { kind: 'new', defaults: NEW_IDEA } })}
          >
            <PlusIcon />
          </button>
        }
      >
        <div className="app-segmented">
          <Segmented label="Estado" options={STATES} value={tab} onChange={setTab} />
        </div>

        {(categories.length > 1 || tags.length > 1) && (
          <div className="app-filters app-filters--padded">
            {categories.length > 1 && (
              <select className="app-chip" aria-label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} ({c.count})
                  </option>
                ))}
              </select>
            )}
            {tags.length > 1 && (
              <select className="app-chip" aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Todos los tags</option>
                {tags.map((t) => (
                  <option key={t.value} value={t.value}>
                    #{t.value} ({t.count})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {shown.length > 0 ? (
          <InsetList>
            {shown.map((item) => {
              const category = typeof item.data.category === 'string' ? item.data.category : null;
              const potential = typeof item.data.potential === 'number' ? item.data.potential : null;
              const nextStep = typeof item.data.nextStep === 'string' ? item.data.nextStep : null;
              const next = IDEA_NEXT[item.status];
              return (
                <div key={item.id} className="ui-row app-idea" data-state={item.status}>
                  <div className="ui-row__body app-idea__body app-press">
                    <button type="button" className="app-press__hit" aria-label={`Abrir «${item.title}»`} onClick={() => setSheet({ open: true, mode: { kind: 'edit', item } })} />
                    <span className="app-idea__icon" aria-hidden>
                      <IdeaIcon />
                    </span>
                    <span className="ui-row__text">
                      <span className="ui-row__title">{item.title}</span>
                      {(category || potential !== null) && (
                        <span className="ui-row__subtitle">
                          {category && <span className="app-idea__category">{category}</span>}
                          {category && potential !== null && ' · '}
                          {potential !== null && (
                            <span className="app-idea__stars" role="img" aria-label={`Potencial: ${potential} de 5`}>
                              {stars(potential)}
                            </span>
                          )}
                        </span>
                      )}
                      {nextStep && <span className="ui-row__subtitle app-idea__next">→ {nextStep}</span>}
                    </span>
                  </div>
                  {next && (
                    <button type="button" className="app-book__next" aria-label={`${next.label}: «${item.title}»`} onClick={() => changeState(item, next.state)}>
                      {next.label}
                    </button>
                  )}
                </div>
              );
            })}
          </InsetList>
        ) : (
          <p className="app-empty">
            {ideas.length === 0
              ? 'Aún no hay ideas. Apunta una en la barra de arriba y se guarda aquí como semilla.'
              : category || tag
                ? 'Ninguna idea con esos filtros.'
                : `Ninguna idea en «${STATES.find((st) => st.value === tab)?.label}».`}
          </p>
        )}
      </LargeTitle>

      <ItemSheet
        open={sheet.open}
        mode={sheet.mode}
        people={[]}
        onClose={closeSheet}
        onCreate={create}
        onSave={save}
        onComplete={(item) => fromSheet(item, complete)}
        onArchive={(item) => fromSheet(item, archive)}
        onDelete={(item) => fromSheet(item, remove)}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
