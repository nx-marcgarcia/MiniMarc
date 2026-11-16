/**
 * Client-side reading of the add/edit sheets. Pure, so the rules are tested without a DOM.
 * Validation errors come back as results: the sheet shows them and keeps the typed text.
 */
import { RELATIONS, type Area, type ItemType, type Person, type Relation } from '@/lib/db/types';
import { isReadingState } from '@/lib/libros';
import { isValidDate, toDue } from '@/lib/time';
import type { MovePatch } from './items';
import { fail, ok, type ActionResult } from './result';

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

/** The edit sheet's fields → the patch for moveItem. `type`/`area` come from the sheet's controls. */
export function editPatchFromForm(
  fd: FormData,
  opts: { type: ItemType; area: Area; reviewMode?: boolean },
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
  if (opts.reviewMode) patch.needsReview = false;
  return ok(patch);
}
