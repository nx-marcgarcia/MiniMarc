'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent, type TransitionStartFunction } from 'react';
import { ideaToProject } from '@/app/actions/projects';
import { LinkPreviewCard } from '@/components/links/LinkPreviewCard';
import { LinkText } from '@/components/links/LinkText';
import { InsetList, Segmented, Sheet } from '@/components/ui';
import { editPatchFromForm, newItemFormError } from '@/lib/actions/forms';
import type { MovePatch } from '@/lib/actions/items';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Area, Item, ItemType, Person } from '@/lib/db/types';
import { originalText } from '@/lib/format';
import { ITEM_TYPES } from '@/lib/items/itemTypes';
import type { PhotoView } from '@/lib/photos/view';
import { REPEAT_LABELS, REPEATS } from '@/lib/recurrence';
import { parseSubtasks, type Subtask } from '@/lib/subtasks';
import { madridDateTime } from '@/lib/time';
import { ItemPhotos } from './ItemPhotos';
import { SubtasksEditor } from './SubtasksEditor';
import { useProjectOptions } from './useProjectOptions';

export type NewItemDefaults = { type: ItemType; area?: Area; personId?: string; projectId?: string; label: string };

export type SheetMode = { kind: 'new'; defaults: NewItemDefaults } | { kind: 'edit'; item: Item };

const AREA_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'trabajo', label: 'Trabajo' },
] as const;

const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'tarea', label: 'Tareas' },
  { value: 'idea', label: 'Ideas' },
  { value: 'compra', label: 'Compras' },
  { value: 'regalo', label: 'Regalos' },
  { value: 'libro', label: 'Libros' },
  { value: 'enlace', label: 'Enlaces' },
  { value: 'nota', label: 'Notas' },
];

/** An own field of the item as the input's default value ("" when it has none). */
const subtasksOf = (item: Item | null): Subtask[] => parseSubtasks(JSON.stringify(item?.data.subtasks ?? []));

const own = (item: Item | null, key: string) => {
  const v = item?.data[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
};

export type ItemSheetProps = {
  open: boolean;
  mode: SheetMode;
  people: Person[];
  /** The edited item's photos (signed URLs from the server). */
  photos?: PhotoView[];
  /** Sin clasificar: saving files the item (clears needsReview). */
  reviewMode?: boolean;
  onClose: () => void;
  /** Must not throw; on `ok: false` the sheet stays open with the typed text and shows `error`. */
  onCreate: (fd: FormData) => Promise<ActionResult<unknown>>;
  onSave: (item: Item, patch: MovePatch) => Promise<ActionResult<unknown>>;
  onComplete: (item: Item) => void;
  onArchive: (item: Item) => void;
  onDelete: (item: Item) => void;
};

const FORM_ID = 'item-sheet-form';

/** Add or edit an item. Also the non-gesture way to complete, archive or delete (reduced motion, keyboard). */
export function ItemSheet(props: ItemSheetProps) {
  const { open, mode, onClose } = props;
  const [pending, startTransition] = useTransition();
  const editing = mode.kind === 'edit' ? mode.item : null;
  const title = editing ? (props.reviewMode ? 'Clasificar' : 'Editar') : mode.kind === 'new' ? mode.defaults.label : '';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
          {editing ? 'OK' : 'Añadir'}
        </button>
      }
    >
      {/* Remount per item so the uncontrolled fields start from its values. A new item's fields
          reset only when the sheet closes, which happens only after a successful save. */}
      <ItemForm key={editing ? editing.id : `new-${String(open)}`} {...props} startTransition={startTransition} />
    </Sheet>
  );
}

type ItemFormProps = ItemSheetProps & { startTransition: TransitionStartFunction };

function ItemForm(props: ItemFormProps) {
  const { open, mode, people, photos, reviewMode, onClose, onCreate, onSave, onComplete, onArchive, onDelete, startTransition } = props;
  const router = useRouter();
  const projectOptions = useProjectOptions(open);
  const item = mode.kind === 'edit' ? mode.item : null;
  const defaults = mode.kind === 'new' ? mode.defaults : null;
  const [type, setType] = useState<ItemType>(item?.type ?? defaults?.type ?? 'tarea');
  const [area, setArea] = useState<Area>(item?.area ?? defaults?.area ?? 'personal');
  const [error, setError] = useState<string | null>(null);
  // Blocks a second submit (double tap, Enter) before `pending` re-renders the button.
  const inFlight = useRef(false);
  const due = item?.dueAt ? madridDateTime(new Date(item.dueAt)) : null;
  const source = item ? originalText(item) : null;

  // onSubmit, not <form action>: React resets an action form's fields when the action ends,
  // which would wipe the typed text on failure.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    let call: () => Promise<ActionResult<unknown>>;
    if (item) {
      const patch = editPatchFromForm(fd, { type, area, reviewMode, item });
      if (!patch.ok) return setError(patch.error);
      call = () => onSave(item, patch.value);
    } else {
      const invalid = newItemFormError(fd);
      if (invalid) return setError(invalid);
      call = () => onCreate(fd);
    }
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const result = await call();
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) onClose();
        else setError(result.error);
      });
    });
  }

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="app-form">
      <input type="hidden" name="type" value={type} />
      {type === 'tarea' && <input type="hidden" name="area" value={area} />}
      <InsetList>
        <input
          className="app-input app-input--title"
          name="title"
          defaultValue={item?.title}
          placeholder="Título"
          aria-label="Título"
          autoComplete="off"
          enterKeyHint="done"
        />
        <textarea
          className="app-input app-input--notes"
          name="notes"
          defaultValue={item?.notes ?? ''}
          placeholder="Notas"
          aria-label="Notas"
          rows={4}
        />
      </InsetList>

      {item?.link && (
        <InsetList header="Enlace">
          <LinkPreviewCard item={item} />
        </InsetList>
      )}

      {source && (
        <InsetList header="Texto original">
          <p className="app-source-text">
            <LinkText text={source} />
          </p>
        </InsetList>
      )}

      {item && (
        <InsetList header="Fotos">
          <ItemPhotos itemId={item.id} photos={photos ?? []} />
        </InsetList>
      )}

      {item && (
        <InsetList header="Lista">
          <label className="app-field">
            <span>Mover a</span>
            <select className="app-input" value={type} onChange={(e) => setType(e.target.value as ItemType)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </InsetList>
      )}

      {item && type === item.type && type !== 'libro' && ITEM_TYPES[type].states.length > 2 && (
        <InsetList>
          <label className="app-field">
            <span>Estado</span>
            <select className="app-input" name="status" defaultValue={item.status}>
              {ITEM_TYPES[type].states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </InsetList>
      )}

      {type === 'compra' && (
        <InsetList>
          <label className="app-field">
            <span>Cantidad</span>
            <input className="app-input" type="number" name="quantity" min={1} step={1} inputMode="numeric" defaultValue={own(item, 'quantity')} />
          </label>
          <label className="app-field">
            <span>Precio</span>
            <input className="app-input" type="text" name="price" inputMode="decimal" placeholder="€" autoComplete="off" defaultValue={own(item, 'price')} />
          </label>
          <label className="app-field">
            <span>Variante</span>
            <input className="app-input" name="variant" placeholder="Talla, color, modelo…" autoComplete="off" defaultValue={own(item, 'variant')} />
          </label>
          <label className="app-field">
            <span>Urgencia</span>
            <select className="app-input" name="urgency" defaultValue={own(item, 'urgency')}>
              <option value="">Sin indicar</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
        </InsetList>
      )}

      {type === 'idea' && (
        <InsetList>
          <label className="app-field">
            <span>Categoría</span>
            <input className="app-input" name="category" placeholder="Negocio, app, contenido, viaje…" autoComplete="off" defaultValue={own(item, 'category')} />
          </label>
          <label className="app-field">
            <span>Potencial</span>
            <select className="app-input" name="potential" defaultValue={own(item, 'potential')}>
              <option value="">Sin valorar</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {'★'.repeat(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="app-field">
            <span>Siguiente paso</span>
            <input className="app-input" name="nextStep" autoComplete="off" defaultValue={own(item, 'nextStep')} />
          </label>
        </InsetList>
      )}

      {type === 'tarea' && (
        <>
          <div className="app-form__segmented">
            <Segmented label="Área" options={[...AREA_OPTIONS]} value={area} onChange={setArea} />
          </div>
          <InsetList footer={area === 'trabajo' ? 'Las tareas de Trabajo no se envían a la IA.' : undefined}>
            <label className="app-field">
              <span>Fecha</span>
              <input className="app-input" type="date" name="dueDate" defaultValue={due?.date} />
            </label>
            <label className="app-field">
              <span>Hora</span>
              <input className="app-input" type="time" name="dueTime" defaultValue={item?.hasTime ? due?.time : undefined} />
            </label>
            <label className="app-field">
              <span>Repetir</span>
              <select className="app-input" name="recurrence" defaultValue={own(item, 'recurrence')}>
                <option value="">No se repite</option>
                {REPEATS.map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          </InsetList>
          <SubtasksEditor key={item?.id ?? 'new'} initial={subtasksOf(item)} />
        </>
      )}

      {type === 'libro' && (
        <InsetList footer="El estado de lectura, el enlace y la portada se cambian en Libros.">
          <label className="app-field">
            <span>Autor</span>
            <input
              className="app-input"
              name="author"
              defaultValue={item?.author ?? ''}
              placeholder="Opcional"
              autoComplete="off"
              maxLength={200}
            />
          </label>
        </InsetList>
      )}

      {type === 'regalo' && (
        <InsetList>
          <label className="app-field">
            <span>Para</span>
            <select className="app-input" name="personId" defaultValue={item?.personId ?? defaults?.personId ?? ''}>
              <option value="">Sin persona</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="app-field">
            <span>Precio aproximado</span>
            <input className="app-input" type="text" name="approxPrice" inputMode="decimal" placeholder="€" autoComplete="off" defaultValue={own(item, 'approxPrice')} />
          </label>
          <label className="app-field">
            <span>Ocasión</span>
            <input className="app-input" name="occasion" placeholder="Cumpleaños, Navidad…" autoComplete="off" defaultValue={own(item, 'occasion')} />
          </label>
        </InsetList>
      )}

      {projectOptions && projectOptions.projects.length > 0 ? (
        <InsetList>
          <label className="app-field">
            <span>Proyecto</span>
            <select className="app-input" name="projectId" defaultValue={item?.projectId ?? defaults?.projectId ?? ''}>
              <option value="">Ninguno</option>
              {projectOptions.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </InsetList>
      ) : (
        defaults?.projectId && <input type="hidden" name="projectId" value={defaults.projectId} />
      )}

      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}

      {item && (
        <InsetList>
          <button type="button" className="ui-row app-action" onClick={() => onComplete(item)}>
            Marcar como hecho
          </button>
          <button type="button" className="ui-row app-action" onClick={() => onArchive(item)}>
            Archivar
          </button>
          {item.type === 'idea' && !item.projectId && projectOptions?.available && (
            <button
              type="button"
              className="ui-row app-action"
              onClick={() =>
                startTransition(async () => {
                  const result = await settle(() => ideaToProject(item.id), 'No se ha podido crear el proyecto.');
                  if (!result.ok) return setError(result.error);
                  onClose();
                  router.push(`/proyectos/${result.value.id}`);
                })
              }
            >
              Convertir en proyecto
            </button>
          )}
          <button type="button" className="ui-row app-action app-action--destructive" onClick={() => onDelete(item)}>
            Eliminar
          </button>
        </InsetList>
      )}
    </form>
  );
}
