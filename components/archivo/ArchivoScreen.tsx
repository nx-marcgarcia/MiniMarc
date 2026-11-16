'use client';

import { useRef, useState, useTransition } from 'react';
import { moveItem } from '@/app/actions/items';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { closedAt, groupArchivo } from '@/lib/archivo';
import type { Item, ItemType } from '@/lib/db/types';
import { TYPE_LABELS } from '@/lib/format';
import { closedLabel, defaultStatus } from '@/lib/items/itemTypes';
import { madridDateTime } from '@/lib/time';

type ToastState = NonNullable<ToastProps['toast']>;
type Filter = 'todo' | ItemType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'tarea', label: 'Tareas' },
  { value: 'compra', label: 'Compras' },
  { value: 'libro', label: 'Libros' },
  { value: 'enlace', label: 'Enlaces' },
  { value: 'idea', label: 'Ideas' },
  { value: 'regalo', label: 'Regalos' },
];

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** "15/10" in Madrid. */
const dayMonth = (iso: string) => madridDateTime(new Date(iso)).date.slice(5).split('-').reverse().join('/');

/**
 * Archivo, like Things' Logbook: everything finished or archived, by month, newest first.
 * "Reabrir" puts an item back in its list (its type's first state, not archived), with Deshacer.
 */
export function ArchivoScreen({ items }: { items: Item[] }) {
  const [filter, setFilter] = useState<Filter>('todo');
  const [reopened, setReopened] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [, startTransition] = useTransition();
  const toastId = useRef(0);

  const visible = items.filter((i) => !reopened.includes(i.id) && (filter === 'todo' || i.type === filter));
  const groups = groupArchivo(visible);

  function showToast(message: string, undo?: () => void) {
    toastId.current += 1;
    setToast({ id: toastId.current, message, actionLabel: undo ? 'Deshacer' : undefined, onAction: undo });
  }

  function reopen(item: Item) {
    setReopened((r) => [...r, item.id]);
    startTransition(async () => {
      const result = await settle(() => moveItem(item.id, { status: defaultStatus(item.type), archived: false }), OFFLINE);
      if (!result.ok) {
        setReopened((r) => r.filter((id) => id !== item.id));
        return showToast(result.error);
      }
      showToast('Reabierto', () =>
        startTransition(async () => {
          const back = await settle(() => moveItem(item.id, { status: item.status, archived: item.archived }), OFFLINE);
          if (back.ok) setReopened((r) => r.filter((id) => id !== item.id));
          else showToast(back.error);
        }),
      );
    });
  }

  return (
    <LargeTitle title="Archivo">
      <div className="app-chips" role="group" aria-label="Tipo">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            className="app-chip"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {groups.length === 0 && <p className="app-empty">Aquí aparece lo que terminas o archivas.</p>}
      {groups.map((g) => (
        <InsetList key={g.key} header={g.header}>
          {g.items.map((item) => (
            <div key={item.id} className="ui-row">
              <span className="ui-row__body">
                <span className="ui-row__text">
                  <span className="ui-row__title">{item.title}</span>
                  <span className="ui-row__subtitle">
                    {TYPE_LABELS[item.type]} · {closedLabel(item)} · {dayMonth(closedAt(item))}
                  </span>
                </span>
                <button type="button" className="app-btn app-btn--tint" onClick={() => reopen(item)} aria-label={`Reabrir «${item.title}»`}>
                  Reabrir
                </button>
              </span>
            </div>
          ))}
        </InsetList>
      ))}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </LargeTitle>
  );
}
