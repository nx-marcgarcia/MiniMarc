/**
 * Client-side reading of the add/edit sheets. Pure, so the rules are tested without a DOM.
 * Validation errors come back as results: the sheet shows them and keeps the typed text.
 */
import { RELATIONS, type Area, type Item, type ItemType, type Person, type Relation } from '@/lib/db/types';
import { isValidStatus, ITEM_TYPES } from '@/lib/items/itemTypes';
import { isReadingState } from '@/lib/libros';
import { isValidDate, toDue } from '@/lib/time';
import type { MovePatch } from './items';
import { fail, ok, type ActionResult } from './result';
import { parseSubtasks } from '@/lib/subtasks';

const text = (fd: FormData, name: string) => String(fd.get(name) ?? '').trim();

export function newItemFormError(fd: FormData): string | null {
  return text(fd, 'title') ? null : 'Escribe un título.';
}

export function personFormError(fd: FormData): string | null {
  if (!text(fd, 'name')) return 'Escribe un nombre.';
  const email = text(fd, 'email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'El correo no es válido.';
  const relation = text(fd, 'relation');
  if (relation && !(RELATIONS as readonly string[]).includes(relation)) return 'La relación no es válida.';
  return null;
}

/** "camiseta: M" per line → { camiseta: 'M' }. Lines without a colon are skipped. */
export function parseSizes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/** The inverse of parseSizes, for the edit sheet's textarea. */
export function sizesToText(sizes: Record<string, string>): string {
  return Object.entries(sizes)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

/**
 * The person sheet's profile fields → the patch for updatePerson. Only the fields the form carries
 * are in the patch (an older form without them never wipes a profile); an empty one clears it.
 */
export function personProfileFromForm(fd: FormData): Partial<
  Pick<Person, 'alias' | 'relation' | 'likes' | 'dislikes' | 'sizes' | 'contact'>
> {
  const patch: ReturnType<typeof personProfileFromForm> = {};
  if (fd.has('alias')) patch.alias = text(fd, 'alias').split(',').map((a) => a.trim()).filter(Boolean);
  if (fd.has('relation')) patch.relation = (text(fd, 'relation') || null) as Relation | null;
  if (fd.has('likes')) patch.likes = text(fd, 'likes') || null;
  if (fd.has('dislikes')) patch.dislikes = text(fd, 'dislikes') || null;
  if (fd.has('sizes')) patch.sizes = parseSizes(text(fd, 'sizes'));
  if (fd.has('email') || fd.has('phone')) {
    const email = text(fd, 'email');
    const phone = text(fd, 'phone');
    patch.contact = { ...(email && { email }), ...(phone && { phone }) };
  }
  return patch;
}

/** The person-date sheet: a label and a real date. */
export function dateFormError(fd: FormData): string | null {
  if (!text(fd, 'label')) return 'Escribe una etiqueta.';
  if (!isValidDate(text(fd, 'date'))) return 'La fecha no es válida.';
  return null;
}

// ---------- Campos propios de cada tipo (items.data) ----------

type FieldSpec = { key: string; kind: 'int' | 'money' | 'text' | 'subtasks'; error?: string };

const PRICE_ERROR = 'El precio no es válido.';
/** A repeating task counts its next date from its own: without one there is nothing to count from. */
export const REPEAT_NEEDS_DATE = 'Para repetirla, la tarea necesita fecha.';

/** The fields of each type the forms edit (the registry's schema is the real validator). */
const DATA_FIELDS: Partial<Record<ItemType, FieldSpec[]>> = {
  compra: [
    { key: 'quantity', kind: 'int', error: 'La cantidad no es válida.' },
    { key: 'price', kind: 'money', error: PRICE_ERROR },
    { key: 'variant', kind: 'text' },
    { key: 'urgency', kind: 'text', error: 'La urgencia no es válida.' },
  ],
  regalo: [
    { key: 'approxPrice', kind: 'money', error: PRICE_ERROR },
    { key: 'occasion', kind: 'text' },
  ],
  tarea: [
    { key: 'recurrence', kind: 'text', error: 'La repetición no es válida.' },
    { key: 'subtasks', kind: 'subtasks', error: 'Las subtareas no son válidas.' },
  ],
  libro: [
    { key: 'rating', kind: 'int', error: 'La valoración va de 1 a 5.' },
    { key: 'pages', kind: 'int', error: 'Las páginas no son válidas.' },
  ],
  idea: [
    { key: 'category', kind: 'text' },
    { key: 'potential', kind: 'int', error: 'El potencial va de 1 a 5.' },
    { key: 'nextStep', kind: 'text' },
  ],
};

/**
 * The type's own fields from a form, over what the item already has (`base`): a field the form does
 * not carry is left alone, an empty one is removed, and the result must pass the type's schema.
 * "12,50" and "12.5" are both prices.
 */
export function dataFromForm(type: ItemType, fd: FormData, base: Record<string, unknown>): ActionResult<Record<string, unknown>> {
  const specs = DATA_FIELDS[type];
  if (!specs) return ok(base);
  const out: Record<string, unknown> = { ...base };
  for (const spec of specs) {
    if (!fd.has(spec.key)) continue;
    const raw = text(fd, spec.key);
    if (spec.kind === 'subtasks') {
      const list = parseSubtasks(raw);
      if (list.length === 0) delete out[spec.key];
      else out[spec.key] = list;
    } else if (raw === '') {
      delete out[spec.key];
    } else if (spec.kind === 'int') {
      if (!/^\d+$/.test(raw)) return fail(spec.error ?? 'Revisa los campos.');
      out[spec.key] = Number(raw);
    } else if (spec.kind === 'money') {
      if (!/^\d+([.,]\d{1,2})?$/.test(raw)) return fail(spec.error ?? 'Revisa los campos.');
      out[spec.key] = Number(raw.replace(',', '.'));
    } else {
      out[spec.key] = raw;
    }
  }
  const parsed = ITEM_TYPES[type].fields.safeParse(out);
  if (parsed.success) return ok(parsed.data);
  const bad = specs.find((s) => s.key === parsed.error.issues[0]?.path[0]);
  return fail(bad?.error ?? 'Revisa los campos.');
}

/** The edit sheet's fields → the patch for moveItem. `type`/`area` come from the sheet's controls. */
export function editPatchFromForm(
  fd: FormData,
  /** `item`: the item being edited. With it, a sheet that keeps its type also sends its status and own fields. */
  opts: { type: ItemType; area: Area; reviewMode?: boolean; item?: Item },
): ActionResult<MovePatch> {
  const titleError = newItemFormError(fd);
  if (titleError) return fail(titleError);
  const patch: MovePatch = { title: text(fd, 'title'), notes: text(fd, 'notes') || null, type: opts.type };
  if (opts.type === 'tarea') {
    patch.area = opts.area;
    try {
      Object.assign(patch, toDue(text(fd, 'dueDate'), text(fd, 'dueTime')));
    } catch {
      return fail('La fecha no es válida.');
    }
  }
  patch.personId = opts.type === 'regalo' ? text(fd, 'personId') || null : null;
  if (opts.type === 'libro') {
    patch.author = text(fd, 'author') || null;
    if (fd.has('link')) patch.link = text(fd, 'link') || null;
    const state = text(fd, 'readingState');
    if (isReadingState(state)) patch.readingState = state;
  }
  // Same type as before: its state and its own fields. Another type restarts them (the repo does it).
  if (opts.item && opts.item.type === opts.type) {
    const status = text(fd, 'status');
    if (status && status !== opts.item.status && isValidStatus(opts.type, status)) patch.status = status;
    const data = dataFromForm(opts.type, fd, opts.item.data);
    if (!data.ok) return fail(data.error);
    if (JSON.stringify(data.value) !== JSON.stringify(opts.item.data)) patch.data = data.value;
  }
  // The "Proyecto" select is only there once 0014 is applied: without it, the project is not touched.
  if (fd.has('projectId')) {
    const projectId = text(fd, 'projectId') || null;
    if (projectId !== (opts.item?.projectId ?? null)) patch.projectId = projectId;
  }
  if (opts.type === 'tarea' && text(fd, 'recurrence') && !patch.dueAt) return fail(REPEAT_NEEDS_DATE);
  if (opts.reviewMode) patch.needsReview = false;
  return ok(patch);
}
