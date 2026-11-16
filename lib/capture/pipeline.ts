/**
 * Capture pipeline: whatever Marc dictates (Siri, extension, web) becomes items or citas.
 * Rule zero: the text is never lost. Every item keeps the whole text in `sourceText`; any AI
 * failure saves it as "Sin clasificar"; a Calendar failure saves the cita as an item with
 * `syncError`; if one of several items fails to save, the whole text is also saved as
 * "Sin clasificar". Trabajo text never reaches the AI.
 * Pure: everything comes in through `deps` (tests use the memory backend and fakes).
 */
import type { Project, ProjectsRepo } from '@/lib/db/projects';
import { createCita } from '@/lib/actions/events';
import { SYNC_UNAVAILABLE } from '@/lib/actions/items';
import { classify, type Classification } from '@/lib/ai/classify';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { taskSyncHook } from '@/lib/calendar/taskSync';
import type { CaptureLogRepo } from '@/lib/db/captureLog';
import type { ItemsRepo } from '@/lib/db/items';
import type { LinksRepo } from '@/lib/db/links';
import type { PeopleRepo } from '@/lib/db/people';
import { domainOf, type StoresRepo } from '@/lib/db/stores';
import type { TagsRepo } from '@/lib/db/tags';
import type { Item, ItemType, NewItem, Origin, Person, PersonDate } from '@/lib/db/types';
import { ITEM_TYPES, isItemType } from '@/lib/items/itemTypes';
import type { LinkPreview } from '@/lib/links/ogParser';
import { extractUrls } from '@/lib/links/linkify';
import { DEFAULT_TZ } from '@/lib/time';
import { findDuplicate } from './duplicates';
import { guessFromLink, parseShortcuts, type LinkGuess, type Shortcuts } from './prep';

export const TITLE_MAX = 200;
export const MIN_CONFIDENCE = 0.6;
export const DEDUP_WINDOW_MS = 30_000;

export type CaptureInput = {
  text: string;
  area?: 'trabajo';
  origin: Origin;
  /** Captured inside a project's page: everything made goes into it (wins over a `>proyecto`). */
  projectId?: string;
};
/** A special date saved from a capture (`kind: 'fecha'`); a birthday has no `id`. */
export type CapturedDate = Pick<PersonDate, 'personId' | 'label' | 'date'> & { personName: string };
export type CaptureResult = {
  items: Item[];
  eventIds: string[];
  dates?: CapturedDate[];
  /** Por qué no se clasificó (causeMessage). Solo cuando la IA falló: el aviso lo cuenta. */
  aiError?: string;
  /** Items this capture made that look like one Marc already had (the toast offers to merge them). */
  duplicates?: { itemId: string; existingId: string }[];
  /** The entry of this capture in the classification log (the toast's chips write corrections to it). */
  logId?: string;
};

export interface CaptureDeps {
  ai: AiProvider;
  items: ItemsRepo;
  people: PeopleRepo;
  /** Stores, links and tags of the second brain. Optional: without them a capture keeps its item and drops those extras. */
  stores?: StoresRepo;
  links?: LinksRepo;
  tags?: TagsRepo;
  /** Projects (0014), for `>proyecto` and captures made in a project's page. Optional. */
  projects?: ProjectsRepo;
  /** Fetches a pasted link's page (title, image, site); never throws. Optional. */
  preview?: (url: string) => Promise<LinkPreview | null>;
  /** Classification log (0012): the input, what the model said, what was created, later Marc's corrections. Optional; never stops a capture. */
  log?: CaptureLogRepo;
  /**
   * Loads the Calendar gateway (calendarGatewayFor on the server). Lazy, so a capture that needs
   * no event reads no credentials, and a load failure (no refresh token) only becomes a syncError.
   */
  calendar: () => Promise<CalendarGateway>;
  now: Date;
  /** Defaults to Europe/Madrid. */
  tz?: string;
}

/** Empty or whitespace-only text: nothing is saved (the endpoint answers 400). */
export class EmptyCaptureError extends Error {
  constructor() {
    super('El texto está vacío');
    this.name = 'EmptyCaptureError';
  }
}

// ---------- Dedup ----------

export function normalizeCapture(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A capture with the same normalized text and area saved less than 30 s ago (and not deleted):
 * its items, so a Shortcut retry or a re-dictation returns them instead of saving twice. Looked
 * up in the database, so it works across serverless instances. The repo is already scoped to
 * the user. If the lookup fails, the capture goes ahead (better a duplicate than a loss).
 */
async function recentDuplicate(text: string, input: CaptureInput, deps: CaptureDeps): Promise<Item[]> {
  const now = deps.now.getTime();
  const key = normalizeCapture(text);
  const trabajo = input.area === 'trabajo';
  try {
    const recent = await deps.items.listRecentCaptures(new Date(now - DEDUP_WINDOW_MS).toISOString());
    return recent
      .filter(
        (i) =>
          now - Date.parse(i.createdAt) < DEDUP_WINDOW_MS &&
          (i.area === 'trabajo') === trabajo &&
          normalizeCapture(i.sourceText ?? '') === key,
      )
      .sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt));
  } catch {
    return [];
  }
}

// ---------- Pipeline ----------

export async function captureText(input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  const text = input.text.trim();
  if (!text) throw new EmptyCaptureError();

  const existing = await recentDuplicate(text, input, deps);
  if (existing.length > 0) return { items: existing, eventIds: [] };

  return run(text, input, deps);
}

/** What the model is told about what already exists, so it links instead of duplicating. */
type Known = { people: string[]; stores: string[]; storeDomains: { name: string; domain: string | null }[]; tags: string[] };

const personLabel = (p: Person) => (p.alias.length ? `${p.name} (también: ${p.alias.join(', ')})` : p.name);

/** Each list is an extra for the prompt: if one cannot be read, the capture goes on without it. */
async function loadKnown(deps: CaptureDeps): Promise<Known> {
  const safe = async <T>(what: string, read: (() => Promise<T[]>) | undefined): Promise<T[]> => {
    if (!read) return [];
    try {
      return await read();
    } catch (err) {
      // Not the AI's fault: logged by name only, the capture goes on without this list.
      console.error(`${what} failed:`, err instanceof Error ? err.name : 'unknown error');
      return [];
    }
  };
  const [people, stores, tags] = await Promise.all([
    safe('listPeople', () => deps.people.listPeople()),
    safe('listStores', deps.stores && (() => deps.stores!.listStores())),
    safe('listTags', deps.tags && (() => deps.tags!.listTags())),
  ]);
  return {
    people: people.map(personLabel),
    stores: stores.map((s) => s.name),
    storeDomains: stores.map((s) => ({ name: s.name, domain: s.domain })),
    tags: tags.map((t) => t.name),
  };
}

/** A pasted link whose type its domain gives away (a video, a known store…): no AI needed. */
function fromLinkGuess(g: LinkGuess, page: LinkPreview | null): Classification {
  const domain = domainOf(g.url);
  const title = (page?.title ?? domain ?? g.url).slice(0, TITLE_MAX);
  const kind = g.type as 'enlace' | 'libro' | 'compra';
  return {
    kind,
    title,
    hasTime: false,
    confidence: 0.9,
    ...(g.store && { store: g.store }),
    // The page's own price, when it gives one (shop pages): the purchase starts with it.
    ...(page?.price != null && { price: page.price, ...(page.currency && { currency: page.currency }) }),
    ...(g.linkKind && { linkKind: g.linkKind }),
    ...(g.tags.length > 0 && { tags: g.tags }),
  };
}

async function fetchPage(deps: CaptureDeps, url: string): Promise<LinkPreview | null> {
  if (!deps.preview) return null;
  try {
    return await deps.preview(url);
  } catch {
    return null;
  }
}

async function run(text: string, input: CaptureInput, rawDeps: CaptureDeps): Promise<CaptureResult> {
  const { origin } = input;

  // The shortcuts (#tag, @persona, !alta, /compra, $25, >proyecto) are read in code; the AI gets the rest.
  const shortcuts = parseShortcuts(text);
  const body = shortcuts.text || text;

  // The project is settled before anything else: a Trabajo project keeps the text away from the AI.
  const project = await resolveProject(input, shortcuts.project, rawDeps);
  const deps = project ? intoProject(rawDeps, project) : rawDeps;
  const work = input.area === 'trabajo' || project?.area === 'trabajo';

  // Trabajo never goes to the AI: one work task with the text as is (without a `>proyecto` already used).
  if (work) {
    const title = project && !input.projectId ? body : text;
    const item = await deps.items.createItem({ ...textFields(title), type: 'tarea', area: 'trabajo', origin, sourceText: text });
    return { items: [item], eventIds: [] };
  }

  // Fuera del try de la IA: si la base de datos no da las personas, la captura sigue (sin la
  // lista de nombres) y, sobre todo, el fallo no se cuenta como si fuera de la IA.
  const known = await loadKnown(deps);

  // Only a link: its domain may say what it is; otherwise the AI gets the page's title.
  const guess = guessFromLink(body, known.storeDomains);
  const page = guess ? await fetchPage(deps, guess.url) : null;
  const urls = extractUrls(body);

  let classified: Classification[] = [];
  let aiError: string | undefined;
  if (guess && guess.type) {
    classified = [fromLinkGuess(guess, page)];
  } else {
    try {
      classified = await classify(
        body,
        {
          now: deps.now,
          tz: deps.tz ?? DEFAULT_TZ,
          people: known.people,
          stores: known.stores,
          tags: known.tags,
          ...(guess && { page: { url: guess.url, title: page?.title ?? null, site: page?.site ?? null } }),
        },
        deps.ai,
      );
    } catch (err) {
      aiError = causeMessage(err);
      // ClassifyError (timeout, daily cap, invalid JSON) or anything else: fall through to "Sin clasificar".
      // Logged (never the text) so a capture that lands in Sin clasificar says why. Con una causa
      // desconocida se añade el nombre del error, que no lleva datos dentro: los que sí podrían
      // llevarlos (JSON, esquema) ya salen clasificados como invalid_output.
      console.error('classify failed:', aiError, aiError === 'unknown' ? `(${errorName(err)})` : '');
    }
  }

  /** Writes the capture to the log (never throws: the log is an extra) and puts its id in the result. */
  const finish = async (res: CaptureResult): Promise<CaptureResult> => {
    if (!deps.log) return res;
    try {
      const id = await deps.log.record({
        rawInput: text,
        source: origin,
        modelOutput: classified.length > 0 ? classified : null,
        error: aiError ?? null,
        itemIds: res.items.map((i) => i.id),
      });
      return id ? { ...res, logId: id } : res;
    } catch {
      return res;
    }
  };

  const unclassified = (): NewItem => ({ ...textFields(text), type: 'tarea', area: null, needsReview: true, origin, sourceText: text });
  if (classified.length === 0) {
    // A pasted link that the AI could not read is still worth keeping as a link, to review.
    if (guess) {
      const fallback = await saveClassified(
        { kind: 'enlace', title: (page?.title ?? domainOf(guess.url) ?? guess.url).slice(0, TITLE_MAX), hasTime: false, confidence: 0 },
        text,
        input,
        deps,
        { items: [], eventIds: [] },
        { shortcuts, urls: [guess.url], page },
      ).then(
        (out) => out,
        () => null,
      );
      if (fallback && fallback.items.length > 0) return finish({ ...fallback, ...(aiError && { aiError }) });
    }
    return finish({ items: [await deps.items.createItem(unclassified())], eventIds: [], ...(aiError && { aiError }) });
  }

  // What Marc already has, to warn about repeats. An extra: if it cannot be read there is no warning.
  let existing: Item[] = [];
  try {
    existing = await deps.items.listItems({ open: true });
  } catch {
    existing = [];
  }

  // Each element is saved on its own: one failure does not undo or block the others.
  const out: CaptureResult = { items: [], eventIds: [] };
  let failure: unknown = null;
  // The links of the note go with its first item (a note with one thing and one link: that thing).
  const linkTarget = classified.findIndex((c) => c.kind !== 'cita' && c.kind !== 'fecha');
  for (const [n, c] of classified.entries()) {
    try {
      await saveClassified(c, text, input, deps, out, { shortcuts, urls: n === linkTarget ? urls : [], page: n === linkTarget ? page : null, existing });
    } catch (err) {
      failure ??= err;
    }
  }
  if (failure === null) return finish(out);

  // Something was not saved: the whole text also goes to "Sin clasificar", so nothing is lost.
  try {
    out.items.push(await deps.items.createItem(unclassified()));
  } catch {
    // Keep whatever was saved; only a capture that saved nothing at all fails.
  }
  if (out.items.length === 0 && out.eventIds.length === 0 && !out.dates?.length) throw failure;
  return finish(out);
}

/**
 * The project of this capture: the page's (`input.projectId`), else the one a `>nombre` names
 * (found without accents, or created when there is none and 0014 is applied). Never throws: a
 * capture never fails because of its project.
 */
async function resolveProject(input: CaptureInput, name: string | undefined, deps: CaptureDeps): Promise<Project | null> {
  const repo = deps.projects;
  if (!repo) return null;
  try {
    if (input.projectId) return await repo.getProject(input.projectId);
    if (!name) return null;
    const found = await repo.findByName(name);
    if (found) return found;
    if (!(await repo.available())) return null;
    return await repo.createProject({ name });
  } catch (err) {
    console.error('project lookup failed:', err instanceof Error ? err.name : 'unknown error');
    return null;
  }
}

/** The same deps, but every item created goes into `project` (and takes its area when it has none). */
function intoProject(deps: CaptureDeps, project: Project): CaptureDeps {
  const items: ItemsRepo = {
    ...deps.items,
    createItem: (fields, opts) =>
      deps.items.createItem({ ...fields, projectId: project.id, area: fields.area ?? project.area ?? null }, opts),
  };
  return { ...deps, items };
}

type SaveExtras = { shortcuts: Shortcuts; urls: string[]; page: LinkPreview | null; existing?: Item[] };

/** Saves one classified element into `out`: a cita in Calendar, or an item. Throws if the item insert fails. */
async function saveClassified(
  c: Classification,
  text: string,
  input: CaptureInput,
  deps: CaptureDeps,
  out: CaptureResult,
  extras: SaveExtras,
): Promise<CaptureResult> {
  const { origin } = input;
  const confident = c.confidence >= MIN_CONFIDENCE;

  if (c.kind === 'cita' && confident && c.startsAt && c.hasTime) {
    const location = c.location ? locationField(c.location) : null;
    const event = {
      title: c.title,
      startsAt: new Date(c.startsAt),
      ...(c.notes && { description: c.notes }),
      ...(location && { location }),
    };
    const r = await createCita({ calendar: deps.calendar }, event);
    if (r.ok) {
      out.eventIds.push(r.eventId);
      return out;
    }
    // Calendar failed: keep the cita as an item to review, with the error visible.
    out.items.push(
      await deps.items.createItem({ ...fromClassification(c, origin), needsReview: true, syncError: r.error, sourceText: text }),
    );
    return out;
  }

  if (c.kind === 'fecha' && confident && c.personName && c.label && c.date) {
    (out.dates ??= []).push(await savePersonDate(deps, c.personName, c.label, c.date, c.notes));
    return out;
  }

  const fields: NewItem = { ...fromClassification(c, origin), needsReview: !confident, sourceText: text };
  const { shortcuts } = extras;
  // The shortcuts the AI does not have to guess: they win over what it said.
  if (shortcuts.kind && isItemType(shortcuts.kind) && c.kind !== 'cita' && c.kind !== 'fecha') {
    fields.type = shortcuts.kind;
    fields.area = shortcuts.kind === 'tarea' ? 'personal' : null;
  }
  // A doubtful one goes to the Bandeja with what the AI thinks it is, not forced into a category.
  if (!confident && !shortcuts.kind) fields.suggestion = { type: fields.type as ItemType, confidence: c.confidence };
  if (shortcuts.priority) fields.priority = shortcuts.priority;
  const personName = c.personName ?? shortcuts.person;
  let person: Person | null = null;
  if (fields.type === 'regalo' && personName) {
    person = await personFor(deps, personName);
    fields.personId = person?.id ?? null;
  }
  const storeId = await storeFor(deps, c.store);
  if (storeId) fields.storeId = storeId;
  const tags = await tagsFor(deps, [...(c.tags ?? []), ...shortcuts.tags]);
  if (tags.length) fields.tags = tags;
  fields.data = dataFor(fields.type as ItemType, c, shortcuts, person);
  if (extras.urls.length > 0) fields.link = extras.urls[0];

  const item = await deps.items.createItem(fields);
  const saved = await syncDatedTask(deps, item);
  out.items.push(saved);
  await saveLinks(deps, saved, extras);
  const repeated = saved.needsReview ? null : findDuplicate(saved, extras.existing ?? []);
  if (repeated) (out.duplicates ??= []).push({ itemId: saved.id, existingId: repeated.id });
  return out;
}

/** The type's own fields (item.data) from what the AI and the shortcuts said; invalid ones are dropped, never the item. */
function dataFor(type: ItemType, c: Classification, sc: Shortcuts, person: Person | null): Record<string, unknown> {
  const price = c.price ?? sc.price;
  let data: Record<string, unknown> = {};
  if (type === 'compra') {
    data = { ...(price != null && { price }), ...(c.currency && { currency: c.currency }), ...(c.quantity && { quantity: c.quantity }) };
  } else if (type === 'regalo') {
    // With nothing said, a gift for someone with a birthday is, for now, for that birthday.
    const occasion = c.occasion ?? (person?.birthday ? 'Cumpleaños' : undefined);
    data = { ...(price != null && { approxPrice: price }), ...(occasion && { occasion }) };
  } else if (type === 'idea') {
    data = { ...(c.category && { category: c.category }) };
  } else if (type === 'enlace') {
    data = { ...(c.linkKind && { kind: c.linkKind }) };
  }
  return isItemType(type) && ITEM_TYPES[type].fields.safeParse(data).success ? data : {};
}

/** The person by name or alias, created if new; null if that fails (the gift is still saved, without a person). */
async function personFor(deps: CaptureDeps, name: string): Promise<Person | null> {
  try {
    return await deps.people.upsertPersonByName(name);
  } catch {
    return null;
  }
}

async function storeFor(deps: CaptureDeps, store: Classification['store']): Promise<string | undefined> {
  if (!store || !deps.stores) return undefined;
  try {
    return (await deps.stores.upsertStoreByName(store.name, store.domain ? { domain: store.domain } : undefined)).id;
  } catch {
    return undefined;
  }
}

async function tagsFor(deps: CaptureDeps, names: string[]): Promise<string[]> {
  if (!deps.tags || names.length === 0) return [];
  try {
    return await deps.tags.upsertTags(names);
  } catch {
    return [];
  }
}

/** Every link of the note goes to item_links (the first with the preview that was fetched). Never throws: the item is saved. */
async function saveLinks(deps: CaptureDeps, item: Item, extras: SaveExtras): Promise<void> {
  if (!deps.links) return;
  for (const [n, url] of extras.urls.entries()) {
    try {
      await deps.links.addLink(item.id, {
        url,
        ...(n === 0 && extras.page && { title: extras.page.title ?? undefined, image: extras.page.image ?? undefined }),
      });
    } catch {
      // A link row is an extra.
    }
  }
}

/** El nombre del error más profundo de la cadena: TypeError, PostgrestError, CalendarError… */
function errorName(err: unknown): string {
  let name = 'desconocido';
  const seen = new Set<unknown>();
  for (let e: unknown = err; e && typeof e === 'object' && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const n = (e as { name?: unknown }).name;
    if (typeof n === 'string' && n) name = n;
  }
  return name;
}

/**
 * Why a classification failed, as a fixed word. Never the error's own message: a JSON or schema
 * failure carries a piece of the model's output, which is the note's text.
 */
export function causeMessage(err: unknown): string {
  const seen = new Set<unknown>();
  for (let e: unknown = err; e && typeof e === 'object' && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e);
    const { name, message } = e as { name?: unknown; message?: unknown };
    if (name === 'ZodError' || name === 'SyntaxError') return 'invalid_output';
    if (typeof message !== 'string') continue;
    if (message.includes('Tiempo de espera agotado')) return 'timeout';
    if (message.includes('Tope diario')) return 'daily_cap';
    if (message.includes('Falta GEMINI_API_KEY')) return 'no_api_key';
    if (message.includes('Respuesta vacía')) return 'empty_response';
    // Billing, not rate limiting: waiting does not fix it. Checked first, as it also says
    // RESOURCE_EXHAUSTED.
    if (/\b402\b|prepayment|credits are depleted/i.test(message)) return 'no_credit';
    if (/RESOURCE_EXHAUSTED|\b429\b/.test(message)) return 'quota';
    // A retired model: every capture fails at once, so it must not read as a generic error.
    if (/NOT_FOUND|\b404\b|no longer available/.test(message)) return 'model_not_found';
  }
  return 'unknown';
}

/** Title (max 200 chars) from the original text; a longer text is kept whole in `notes`. */
export function textFields(text: string): Pick<NewItem, 'title' | 'notes'> {
  if (text.length <= TITLE_MAX) return { title: text, notes: null };
  return { title: `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`, notes: text };
}

/** Ubicación de la nota en una sola línea (max 200 chars); null si queda vacía. */
export function locationField(s: string): string | null {
  return s.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX).trimEnd() || null;
}

function fromClassification(c: Classification, origin: Origin): NewItem & { type: ItemType } {
  // A cita that does not end up in Calendar is kept as a task with its date; a doubtful fecha
  // goes to Sin clasificar as a task too.
  const type: ItemType = c.kind === 'cita' || c.kind === 'fecha' ? 'tarea' : c.kind;
  const { title, notes } = textFields(c.title);
  const item: NewItem & { type: ItemType } = {
    type,
    title,
    notes: c.notes ?? notes,
    area: type === 'tarea' ? 'personal' : null,
    dueAt: type === 'libro' ? null : (c.startsAt ?? null),
    hasTime: type === 'libro' ? false : c.hasTime,
    confidence: c.confidence,
    origin,
  };
  if (c.priority) item.priority = c.priority;
  // A book starts as "por leer" (the repo's default); its author is kept for the future search.
  if (type === 'libro' && c.author) item.author = c.author.slice(0, TITLE_MAX);
  const location = c.location ? locationField(c.location) : null;
  if (location) item.location = location;
  return item;
}

/**
 * A person's special date: creates (or reuses) the person by name. "Cumpleaños" sets the
 * birthday; any other label adds a yearly person date, unless the same one is already there
 * (a retried capture). Throws if saving fails (the text then goes to Sin clasificar).
 */
async function savePersonDate(
  deps: CaptureDeps,
  name: string,
  label: string,
  date: string,
  notes: string | undefined,
): Promise<CapturedDate> {
  const person = await deps.people.upsertPersonByName(name);
  const saved = { personId: person.id, personName: person.name, date };
  if (/^cumplea/i.test(label)) {
    await deps.people.updatePerson(person.id, { birthday: date });
    return { ...saved, label: 'Cumpleaños' };
  }
  const existing = await deps.people.listDates(person.id);
  if (!existing.some((d) => d.date === date && d.label.toLowerCase() === label.toLowerCase())) {
    await deps.people.addDate({ personId: person.id, label, date, notes: notes ?? null });
  }
  return { ...saved, label };
}

/**
 * A classified task with a date gets its "Tareas" event, as the item actions do (taskSyncHook
 * decides: a time makes it a 30 min event, no time makes it an all-day one). Never throws: the
 * item is already saved.
 */
async function syncDatedTask(deps: CaptureDeps, item: Item): Promise<Item> {
  let fields: Pick<Item, 'calendarEventId' | 'syncError'>;
  try {
    const r = await taskSyncHook(deps.calendar)(item);
    fields = { calendarEventId: r.eventId, syncError: r.error };
  } catch {
    fields = { calendarEventId: null, syncError: SYNC_UNAVAILABLE };
  }
  if (!fields.calendarEventId && !fields.syncError) return item;
  try {
    return await deps.items.updateItem(item.id, fields);
  } catch {
    return { ...item, ...fields };
  }
}
