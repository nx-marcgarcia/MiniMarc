import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';
import {
  defaultStatus,
  isDoneStatus,
  isItemType,
  isOpen,
  isValidStatus,
  normalizeLegacyStatus,
  parseItemData,
} from '@/lib/items/itemTypes';
import { deriveLink } from '@/lib/links/linkify';
import type { Item, ItemFilter, ItemPatch, NewItem, ReadingState } from './types';

export interface ItemsRepo {
  /**
   * With `opts.id` the item is created under that id, or returned as it is if it already exists
   * (so an import or a migration can be run twice); `opts.createdAt` keeps an original date.
   */
  createItem(input: NewItem, opts?: { id?: string; createdAt?: string }): Promise<Item>;
  listItems(f?: ItemFilter): Promise<Item[]>;
  updateItem(id: string, patch: ItemPatch): Promise<Item>;
  softDeleteItem(id: string): Promise<void>;
  restoreItem(id: string): Promise<void>;
  /** Soft-deleted items deleted within the last `days` days, most recently deleted first (Papelera). */
  listDeleted(days: number): Promise<Item[]>;
  /** Undeleted items made by a capture (with sourceText) created at or after `since` (capture dedup). */
  listRecentCaptures(since: string): Promise<Item[]>;
  purgeDeletedOlderThan(days: number): Promise<number>;
  /** Every item, deleted or not, with a syncError or a Calendar event (cron maintenance). */
  listCalendarState(): Promise<Item[]>;
  /** Items soft-deleted more than `days` days ago, oldest first. */
  listDeletedBefore(days: number): Promise<Item[]>;
  /** Removes the row for good (after its Calendar event is gone). */
  hardDelete(id: string): Promise<void>;
  /** Undeleted items with a link whose preview was never fetched (link_site null), newest first. */
  listMissingPreviews(): Promise<Item[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Correspondencia única camelCase (Item) ↔ snake_case (columna). */
const COLUMNS = {
  id: 'id',
  type: 'type',
  title: 'title',
  notes: 'notes',
  area: 'area',
  dueAt: 'due_at',
  hasTime: 'has_time',
  status: 'status',
  personId: 'person_id',
  origin: 'origin',
  needsReview: 'needs_review',
  confidence: 'confidence',
  calendarEventId: 'calendar_event_id',
  syncError: 'sync_error',
  sourceText: 'source_text',
  author: 'author',
  readingState: 'reading_state',
  link: 'link',
  linkTitle: 'link_title',
  linkImage: 'link_image',
  linkSite: 'link_site',
  location: 'location',
  data: 'data',
  storeId: 'store_id',
  priority: 'priority',
  remindAt: 'remind_at',
  pinned: 'pinned',
  archived: 'archived',
  completedAt: 'completed_at',
  tags: 'tags',
  suggestion: 'suggestion',
  createdAt: 'created_at',
  deletedAt: 'deleted_at',
} as const satisfies Record<keyof Item, string>;

const READING_STATES: readonly string[] = ['por_leer', 'leyendo', 'leido', 'abandonado'];

/**
 * A row as the app sees it. Rows written before phase 1 carry 'pendiente' / 'hecho' / 'archivado'
 * (and a libro its reading_state): they are translated here, so the app behaves the same before
 * and after scripts/migrate-v2.ts rewrites them. Columns of 0011 that are not there yet read as
 * their defaults.
 */
export function rowToItem(row: Row): Item {
  const out: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(COLUMNS)) out[k] = row[col] ?? null;
  out.hasTime = Boolean(row.has_time);
  out.needsReview = Boolean(row.needs_review);
  out.confidence = row.confidence == null ? null : Number(row.confidence);
  out.pinned = Boolean(row.pinned);
  out.data = row.data && typeof row.data === 'object' ? row.data : {};
  out.tags = Array.isArray(row.tags) ? row.tags : [];
  out.suggestion = row.suggestion && typeof row.suggestion === 'object' ? row.suggestion : null;
  const rawStatus = String(row.status ?? 'pendiente');
  if (isItemType(row.type)) {
    const { status, archived } = normalizeLegacyStatus(row.type, rawStatus, (row.reading_state as string | null) ?? null);
    out.status = status;
    out.archived = Boolean(row.archived) || archived;
    out.readingState = row.type === 'libro' && READING_STATES.includes(status) ? (status as ReadingState) : null;
  } else {
    out.status = rawStatus;
    out.archived = Boolean(row.archived);
  }
  return out as unknown as Item;
}

/**
 * Item fields as columns. `readingState` is derived from `status` on read, so it is never
 * written: the legacy reading_state column is left as it was.
 */
export function itemToRow(item: Partial<Item>): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === undefined || k === 'readingState') continue;
    const col = COLUMNS[k as keyof Item];
    if (col) row[col] = v;
  }
  return row;
}

/**
 * Columns added after 0001 (0008 to 0011): left out of an insert while they hold their default,
 * so a capture keeps working if one of those migrations is not applied yet. The new status
 * values do need 0011 (it drops the old CHECK).
 */
const OPTIONAL_FIELDS = [
  'author',
  'link',
  'linkTitle',
  'linkImage',
  'linkSite',
  'location',
  'storeId',
  'priority',
  'remindAt',
  'completedAt',
  'suggestion',
] as const;

function withoutEmptyOptionalFields(item: Partial<Item>): Partial<Item> {
  const out = { ...item };
  for (const k of OPTIONAL_FIELDS) if (out[k] == null) delete out[k];
  if (out.data && Object.keys(out.data).length === 0) delete out.data;
  if (out.tags?.length === 0) delete out.tags;
  if (out.pinned === false) delete out.pinned;
  if (out.archived === false) delete out.archived;
  return out;
}

/**
 * The only door to the database for an item: the type must be in the registry, the status one of
 * its states and `data` must pass the type's Zod schema (which also fills its defaults).
 * Throws otherwise, before anything is written. Since 0011 the CHECK constraints are gone, so
 * this is the guard (tests/db/itemsValidation.test.ts).
 */
function validated(type: string, status: string, data: unknown, suggestion?: Item['suggestion']): { data: Record<string, unknown> } {
  if (!isItemType(type)) throw new Error(`Tipo de item desconocido: ${type}`);
  if (suggestion && !isItemType(suggestion.type)) throw new Error(`Sugerencia de un tipo desconocido: ${suggestion.type}`);
  if (!isValidStatus(type, status)) throw new Error(`Estado «${status}» no válido para ${type}`);
  return { data: parseItemData(type, data ?? {}) };
}

export function createItemsRepo(
  backend: DbBackend,
  opts: { now?: () => Date } = {},
): ItemsRepo {
  const now = opts.now ?? (() => new Date());

  return {
    async createItem(input, opts = {}) {
      if (opts.id) {
        const [existing] = await backend.select('items', { eq: { id: opts.id } });
        if (existing) return rowToItem(existing);
      }
      const full: Omit<Item, 'id' | 'createdAt' | 'deletedAt'> = {
        notes: null,
        area: null,
        dueAt: null,
        hasTime: false,
        status: undefined as unknown as string,
        personId: null,
        origin: 'web',
        needsReview: false,
        confidence: null,
        calendarEventId: null,
        syncError: null,
        sourceText: null,
        author: null,
        readingState: null,
        link: null,
        linkTitle: null,
        linkImage: null,
        linkSite: null,
        location: null,
        data: {},
        storeId: null,
        priority: null,
        remindAt: null,
        suggestion: null,
        pinned: false,
        archived: false,
        completedAt: null,
        tags: [],
        ...input,
      };
      // No link of its own but a URL in the title or notes: that URL is the link.
      full.link = deriveLink(full);
      // A libro's status is its reading state; `readingState` is only a way to ask for it.
      full.status =
        input.status ??
        (full.type === 'libro' ? input.readingState : null) ??
        (isItemType(full.type) ? defaultStatus(full.type) : '');
      full.data = validated(full.type, full.status, full.data, full.suggestion).data;
      if (isItemType(full.type) && isDoneStatus(full.type, full.status)) full.completedAt ??= now().toISOString();
      full.readingState = null;
      const row = itemToRow(withoutEmptyOptionalFields(full));
      if (opts.id) row.id = opts.id;
      if (opts.createdAt) row.created_at = opts.createdAt;
      return rowToItem(await backend.insert('items', row));
    },

    async listItems(f = {}) {
      const eq = itemToRow({
        type: f.type,
        area: f.area,
        storeId: f.storeId,
        needsReview: f.needsReview,
      });
      const gte = f.createdSince ? { created_at: f.createdSince } : undefined;
      const rows = await backend.select('items', { eq, isNull: ['deleted_at'], gte });
      // Status and archived are compared after reading: rows from before phase 1 still hold the
      // old values in the database and are translated by rowToItem.
      return rows
        .map(rowToItem)
        .filter((i) => f.status === undefined || i.status === f.status)
        .filter((i) => f.archived === undefined || i.archived === f.archived)
        .filter((i) => !f.open || isOpen(i))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },

    async updateItem(id, patch) {
      const full: ItemPatch = { ...patch };
      if (full.readingState && full.status === undefined) full.status = full.readingState;
      delete full.readingState;
      // Only a patch that can change what the registry checks needs the stored item.
      if (full.type !== undefined || full.status !== undefined || full.data !== undefined || full.suggestion) {
        const [row] = await backend.select('items', { eq: { id } });
        if (!row) throw new Error(`update items ${id}: not found`);
        const current = rowToItem(row);
        const type = full.type ?? current.type;
        if (full.type !== undefined && full.type !== current.type) {
          // Another type: its states and fields differ, so what no longer fits starts over.
          if (full.status === undefined) full.status = isItemType(type) ? defaultStatus(type) : current.status;
          if (full.data === undefined) full.data = {};
        }
        const status = full.status ?? current.status;
        full.data = validated(type, status, full.data ?? current.data, full.suggestion).data;
        if (full.status !== undefined && full.status !== current.status && isItemType(type)) {
          full.completedAt = isDoneStatus(type, full.status) ? now().toISOString() : null;
        }
        if (full.status === undefined) delete full.status;
      }
      return rowToItem(await backend.update('items', id, itemToRow(full)));
    },

    async softDeleteItem(id) {
      await backend.update('items', id, { deleted_at: now().toISOString() });
    },

    async restoreItem(id) {
      await backend.update('items', id, { deleted_at: null });
    },

    async listDeleted(days) {
      const since = new Date(now().getTime() - days * DAY_MS).toISOString();
      const rows = await backend.select('items', { notNull: ['deleted_at'], gte: { deleted_at: since } });
      return rows
        .map(rowToItem)
        .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!));
    },

    async listRecentCaptures(since) {
      const rows = await backend.select('items', {
        isNull: ['deleted_at'],
        notNull: ['source_text'],
        gte: { created_at: since },
      });
      return rows.map(rowToItem);
    },

    async purgeDeletedOlderThan(days) {
      const cutoff = new Date(now().getTime() - days * DAY_MS);
      return backend.remove('items', { notNull: ['deleted_at'], lt: { deleted_at: cutoff.toISOString() } });
    },

    async listCalendarState() {
      const [withError, withEvent] = await Promise.all([
        backend.select('items', { notNull: ['sync_error'] }),
        backend.select('items', { notNull: ['calendar_event_id'] }),
      ]);
      const byId = new Map<string, Item>();
      for (const row of [...withError, ...withEvent]) byId.set(String(row.id), rowToItem(row));
      return [...byId.values()];
    },

    async listDeletedBefore(days) {
      const cutoff = new Date(now().getTime() - days * DAY_MS).toISOString();
      const rows = await backend.select('items', { notNull: ['deleted_at'], lt: { deleted_at: cutoff } });
      return rows.map(rowToItem).sort((a, b) => Date.parse(a.deletedAt!) - Date.parse(b.deletedAt!));
    },

    async hardDelete(id) {
      await backend.remove('items', { eq: { id } });
    },

    async listMissingPreviews() {
      const rows = await backend.select('items', { notNull: ['link'], isNull: ['link_site', 'deleted_at'] });
      return rows.map(rowToItem).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
  };
}

export function createSupabaseItemsRepo(
  client: SupabaseClient,
  opts: { userId?: string; now?: () => Date } = {},
): ItemsRepo {
  return createItemsRepo(createSupabaseBackend(client, opts), opts);
}
