/**
 * Logic behind the item server actions (app/actions/items.ts) and the list screens.
 * Pure: everything goes through the repos in `deps`, so tests run on the memory backend.
 */
import { ARCHIVO_LIMIT, closedAt } from '@/lib/archivo';
import type { ProjectsRepo } from '@/lib/db/projects';
import { z } from 'zod';
import { matchesArea, type AreaFilter } from '@/lib/area';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { Area, Item, ItemPatch, ItemType, NewItem, Person } from '@/lib/db/types';
import { completionStatus, defaultStatus, isOpen, ITEM_TYPE_IDS } from '@/lib/items/itemTypes';
import { READING_STATES } from '@/lib/libros';
import { deriveLink } from '@/lib/links/linkify';
import { nextOccurrence } from '@/lib/tareas';
import { isValidDate, toDue } from '@/lib/time';
import { dataFromForm, personProfileFromForm, REPEAT_NEEDS_DATE } from './forms';
import { UserError } from './result';

/** Same shape as Tarea 7's `syncTaskEvent(item, gw)`. */
export type SyncResult = { eventId: string | null; error: string | null };

/**
 * Called after every write with the item as it now stands (a deleted item carries `deletedAt`).
 * Its result is stored as `calendarEventId` / `syncError`. It may throw: `afterWrite` catches it,
 * stores SYNC_UNAVAILABLE and the action still succeeds (the item is already saved).
 * Tarea 7 plugs Google Calendar in here; see `getDeps()` in lib/actions/server.ts.
 */
export type ItemSync = (item: Item) => Promise<SyncResult>;

/** `syncError` stored when the sync hook throws instead of reporting an error. */
export const SYNC_UNAVAILABLE = 'calendar_unavailable';

export interface ActionDeps {
  items: ItemsRepo;
  people: PeopleRepo;
  sync?: ItemSync;
  /** Projects (0014); without it, nothing goes into a project. */
  projects?: ProjectsRepo;
}

const ITEM_TYPES = ITEM_TYPE_IDS as [ItemType, ...ItemType[]];
const AREAS = ['personal', 'trabajo'] as const satisfies readonly Area[];

const EMPTY_TITLE = 'El título no puede estar vacío';

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

/** Longest author we keep (same as a title). */
export const AUTHOR_MAX = 200;

/**
 * Reads the add-item form: title, type, area, notes, personId, dueDate, dueTime, and for a
 * libro also author, link and readingState (default 'por_leer').
 */
export function parseNewItem(fd: FormData): NewItem {
  const title = field(fd, 'title');
  if (!title) throw new UserError(EMPTY_TITLE);
  const type = z.enum(ITEM_TYPES).parse(field(fd, 'type') || 'tarea');
  const areaRaw = field(fd, 'area');
  const area = areaRaw ? z.enum(AREAS).parse(areaRaw) : type === 'tarea' ? 'personal' : null;
  const item: NewItem = {
    type,
    title,
    area,
    notes: field(fd, 'notes') || null,
    personId: type === 'regalo' ? field(fd, 'personId') || null : null,
    ...due(field(fd, 'dueDate'), field(fd, 'dueTime')),
    origin: 'web',
  };
  if (type === 'tarea' && field(fd, 'recurrence') && !item.dueAt) throw new UserError(REPEAT_NEEDS_DATE);
  const own = dataFromForm(type, fd, {});
  if (!own.ok) throw new UserError(own.error);
  if (Object.keys(own.value).length > 0) item.data = own.value;
  if (type === 'libro') {
    item.author = field(fd, 'author').slice(0, AUTHOR_MAX) || null;
    item.link = field(fd, 'link') || null;
    item.readingState = z.enum(READING_STATES).parse(field(fd, 'readingState') || 'por_leer');
  }
  return item;
}

function due(date: string, time: string) {
  try {
    return toDue(date, time);
  } catch {
    throw new UserError('La fecha no es válida.');
  }
}

/** What the UI may change on an existing item (edit sheet, swipe, "Mover a…"). */
export const movePatchSchema = z
  .object({
    title: z.string(),
    notes: z.string().nullable(),
    type: z.enum(ITEM_TYPES),
    area: z.enum(AREAS).nullable(),
    personId: z.string().nullable(),
    /** One of the type's states (the repo checks it against the registry). */
    status: z.string().min(1),
    archived: z.boolean(),
    pinned: z.boolean(),
    priority: z.enum(['baja', 'media', 'alta']).nullable(),
    tags: z.array(z.string().trim().min(1)),
    storeId: z.string().nullable(),
    projectId: z.string().min(1).nullable(),
    remindAt: z.iso.datetime({ offset: true }).nullable(),
    data: z.record(z.string(), z.unknown()),
    /** What the AI thinks a doubtful item is; null clears it (accepted or reclassified). */
    suggestion: z.object({ type: z.enum(ITEM_TYPES), confidence: z.number().min(0).max(1) }).nullable(),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    hasTime: z.boolean(),
    needsReview: z.boolean(),
    author: z.string().max(AUTHOR_MAX).nullable(),
    link: z.string().nullable(),
    readingState: z.enum([...READING_STATES, 'abandonado']).nullable(),
  })
  .partial()
  .strict();

export type MovePatch = z.infer<typeof movePatchSchema>;

async function findItem(deps: ActionDeps, id: string): Promise<Item> {
  const item = (await deps.items.listItems()).find((i) => i.id === id);
  if (!item) throw new Error(`No existe el elemento ${id}`);
  return item;
}

/**
 * Runs the sync hook and stores what it reports, if anything changed.
 * Never throws: the item write has already happened, so a sync failure (or failing to store
 * its result) must not turn it into a reported failure, which would invite a duplicate.
 */
export async function afterWrite(deps: Pick<ActionDeps, 'items' | 'sync'>, item: Item): Promise<Item> {
  if (!deps.sync) return item;
  let fields: Pick<Item, 'calendarEventId' | 'syncError'>;
  try {
    const r = await deps.sync(item);
    fields = { calendarEventId: r.eventId, syncError: r.error };
  } catch {
    fields = { calendarEventId: item.calendarEventId, syncError: SYNC_UNAVAILABLE };
  }
  if (fields.calendarEventId === item.calendarEventId && fields.syncError === item.syncError) return item;
  try {
    if (item.deletedAt) {
      // Deleted rows stay hidden; the update keeps Undo able to recreate the event.
      await deps.items.updateItem(item.id, fields);
      return { ...item, ...fields };
    }
    return await deps.items.updateItem(item.id, fields);
  } catch {
    return item;
  }
}

export async function addItem(deps: ActionDeps, fd: FormData): Promise<Item> {
  const fields = parseNewItem(fd);
  const projectId = field(fd, 'projectId');
  if (projectId && deps.projects) {
    const project = await deps.projects.getProject(projectId);
    if (!project) throw new UserError('Ese proyecto ya no existe');
    fields.projectId = project.id;
    // Made inside a project: it takes the project's area unless the form chose one.
    if (!field(fd, 'area') && project.area) fields.area = project.area;
  }
  return saveNewItem(deps, fields);
}

/** Creates an already-validated item and runs the sync hook (a timed task gets its event). */
export async function saveNewItem(deps: ActionDeps, fields: NewItem): Promise<Item> {
  return afterWrite(deps, await deps.items.createItem(fields));
}

export async function toggleDone(deps: ActionDeps, id: string, now: Date = new Date()): Promise<Item> {
  const item = await findItem(deps, id);
  const next = nextOccurrence(item, now);
  if (next) return afterWrite(deps, await deps.items.updateItem(id, { dueAt: next }));
  // Complete ⇄ reopen: the state the type's check sets (tarea: hecha, compra: comprado, libro: leido…)
  // and the type's initial one.
  const status = item.status === completionStatus(item.type) ? defaultStatus(item.type) : completionStatus(item.type);
  return afterWrite(deps, await deps.items.updateItem(id, { status }));
}

export async function moveItem(deps: ActionDeps, id: string, patch: MovePatch): Promise<Item> {
  const clean: ItemPatch = movePatchSchema.parse(patch);
  if (clean.title !== undefined) {
    clean.title = clean.title.trim();
    if (!clean.title) throw new UserError(EMPTY_TITLE);
  }
  const current = await findItem(deps, id);
  const type = clean.type ?? current.type;
  // A task always belongs to one area, so it never shows up in both Tareas views.
  if (type === 'tarea' && (clean.area ?? current.area) == null) clean.area = 'personal';
  if (type !== 'regalo' && current.personId && clean.personId === undefined) clean.personId = null;
  // A libro's status is its reading state, and changing type restarts the status: both are the repo's job.
  if (clean.readingState === null) delete clean.readingState;
  if (clean.author !== undefined) clean.author = clean.author?.trim() || null;
  if (clean.link !== undefined) clean.link = clean.link?.trim() || null;
  // No link of its own but a URL in the title or notes: that URL is the link. Only a real change
  // is written, so the preview is fetched again only when the link changes.
  const link = deriveLink({
    title: clean.title ?? current.title,
    notes: clean.notes !== undefined ? clean.notes : current.notes,
    link: clean.link !== undefined ? clean.link : current.link,
  });
  if (link !== current.link) {
    clean.link = link;
    // A stale preview goes with the old link (only once 0009 is there, i.e. it was ever fetched).
    if (current.linkSite !== null) Object.assign(clean, { linkTitle: null, linkImage: null, linkSite: null });
  } else {
    delete clean.link;
  }
  // Only tasks have a due date: leaving 'tarea' drops it (and, via sync, its Calendar event).
  if (type !== 'tarea' && (current.dueAt || current.hasTime || clean.dueAt || clean.hasTime)) {
    clean.dueAt = null;
    clean.hasTime = false;
  }
  return afterWrite(deps, await deps.items.updateItem(id, clean));
}

export async function deleteItem(deps: ActionDeps, id: string): Promise<void> {
  const item = await findItem(deps, id);
  await deps.items.softDeleteItem(id);
  await afterWrite(deps, { ...item, deletedAt: new Date().toISOString() });
}

export async function undoDelete(deps: ActionDeps, id: string): Promise<Item> {
  await deps.items.restoreItem(id);
  return afterWrite(deps, await findItem(deps, id));
}

/** Runs the sync hook again for an item whose last sync failed ("Reintentar"). */
export async function retrySync(deps: ActionDeps, id: string): Promise<Item> {
  return afterWrite(deps, await findItem(deps, id));
}

// ---------- People ----------

function parseBirthday(fd: FormData): string | null {
  const b = field(fd, 'birthday');
  if (!b) return null;
  if (!isValidDate(b)) throw new UserError('La fecha no es válida.');
  return b;
}

/** Reads name, birthday ('YYYY-MM-DD', optional) and notes, and creates (or reuses) the person. */
export async function addPerson(deps: ActionDeps, fd: FormData): Promise<Person> {
  const birthday = parseBirthday(fd);
  const notes = field(fd, 'notes');
  const person = await deps.people.upsertPersonByName(field(fd, 'name'));
  const profile = personProfileFromForm(fd);
  if (!birthday && !notes && Object.keys(profile).length === 0) return person;
  return deps.people.updatePerson(person.id, { ...(birthday && { birthday }), ...(notes && { notes }), ...profile });
}

export async function updatePerson(deps: ActionDeps, id: string, fd: FormData): Promise<Person> {
  return deps.people.updatePerson(id, {
    name: field(fd, 'name'),
    birthday: parseBirthday(fd),
    notes: field(fd, 'notes') || null,
    ...personProfileFromForm(fd),
  });
}

// ---------- Lists (read side of the screens) ----------

const byDueThenNewest = (a: Item, b: Item) => {
  if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
};

/** Pending, classified tasks of one area (or both, with 'todo'). A task without area counts as Personal. */
export async function listTareas(deps: ActionDeps, area: AreaFilter): Promise<Item[]> {
  const all = await deps.items.listItems({ type: 'tarea', open: true, needsReview: false });
  return all.filter((i) => matchesArea(i.area, area)).sort(byDueThenNewest);
}

/** Pending, classified items of one type (Ideas, Compras…), newest first. */
export async function listByType(deps: ActionDeps, type: ItemType): Promise<Item[]> {
  return deps.items.listItems({ type, open: true, needsReview: false });
}

/** Every classified, not archived book (por leer, leyendo and leídos), newest first. */
export async function listLibros(deps: ActionDeps): Promise<Item[]> {
  return deps.items.listItems({ type: 'libro', needsReview: false, archived: false });
}

/**
 * Pending items waiting for review. With `area`, only that area (no area counts as Personal),
 * so Personal and Trabajo are never listed together; without it, all of them (for counts).
 */
export async function listSinClasificar(deps: ActionDeps, area?: AreaFilter): Promise<Item[]> {
  const all = await deps.items.listItems({ open: true, needsReview: true });
  return area ? all.filter((i) => matchesArea(i.area, area)) : all;
}

/** The Bandeja shows what came in during this window. */
export const RECENT_HOURS = 24;
/** The Papelera keeps soft-deleted items this long; the hourly job (Tarea 16) purges the rest. */
export const TRASH_DAYS = 30;

/**
 * Bandeja "Recién añadido": everything created in the last 24 h (any status, not deleted),
 * newest first, split so Personal and Trabajo are never mixed. No area counts as Personal.
 */
export async function listRecent(deps: ActionDeps, now: Date): Promise<Record<Area, Item[]>> {
  const createdSince = new Date(now.getTime() - RECENT_HOURS * 60 * 60 * 1000).toISOString();
  const all = await deps.items.listItems({ createdSince });
  return {
    personal: all.filter((i) => i.area !== 'trabajo'),
    trabajo: all.filter((i) => i.area === 'trabajo'),
  };
}

/** Archivo: what was finished or archived (not deleted), most recently closed first, at most 200. */
export async function listArchivo(deps: ActionDeps): Promise<Item[]> {
  const all = await deps.items.listItems({ needsReview: false });
  return all
    .filter((i) => !isOpen(i))
    .sort((a, b) => closedAt(b).localeCompare(closedAt(a)))
    .slice(0, ARCHIVO_LIMIT);
}

/** Papelera: items deleted in the last 30 days, most recently deleted first. */
export async function listPapelera(deps: ActionDeps): Promise<Item[]> {
  return deps.items.listDeleted(TRASH_DAYS);
}

export interface RegalosGroups {
  people: { person: Person; items: Item[] }[];
  /** Gifts with no person (or whose person no longer exists). */
  unassigned: Item[];
}

/** Every person (alphabetical) with their pending gifts, plus the gifts with no person. */
export async function listRegalos(deps: ActionDeps): Promise<RegalosGroups> {
  const [people, gifts] = await Promise.all([deps.people.listPeople(), listByType(deps, 'regalo')]);
  const known = new Set(people.map((p) => p.id));
  return {
    people: people.map((person) => ({ person, items: gifts.filter((g) => g.personId === person.id) })),
    unassigned: gifts.filter((g) => !g.personId || !known.has(g.personId)),
  };
}
