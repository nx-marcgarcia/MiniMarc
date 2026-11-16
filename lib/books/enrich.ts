/**
 * Fills in a book's author, cover and pages after it is saved (never what Marc typed), and the
 * repo wrapper that schedules it. The lookup runs after the response, so it never slows or
 * fails a save.
 */
import type { ItemsRepo } from '@/lib/db/items';
import type { Item } from '@/lib/db/types';
import { lookupBook, type BookFetcher } from './lookup';

const hasCover = (item: Item) => typeof item.data.cover === 'string' && item.data.cover !== '';

/** A book is worth looking up while it lacks its author or its cover. */
export const needsBookInfo = (item: Pick<Item, 'type' | 'author' | 'data'>): boolean =>
  item.type === 'libro' && (!item.author || typeof item.data.cover !== 'string' || item.data.cover === '');

/** Looks the book up and stores what is missing. True when something was stored. */
export async function enrichBook(items: Pick<ItemsRepo, 'updateItem'>, item: Item, fetcher: BookFetcher): Promise<boolean> {
  if (!needsBookInfo(item)) return false;
  const info = await lookupBook(item.title, item.author, fetcher);
  if (!info) return false;
  const data = { ...item.data };
  if (info.cover && !hasCover(item)) data.cover = info.cover;
  if (info.pages && data.pages === undefined) data.pages = info.pages;
  const patch: { author?: string; data?: Record<string, unknown> } = {};
  if (info.author && !item.author) patch.author = info.author;
  if (data.cover !== item.data.cover || data.pages !== item.data.pages) patch.data = data;
  if (!patch.author && !patch.data) return false;
  try {
    await items.updateItem(item.id, patch);
    return true;
  } catch {
    return false;
  }
}

export type BookInfoScheduler = (item: Item) => void;

/** The repo, plus a lookup scheduled when a book is saved without its author or cover (or retitled). */
export function withBookInfo(repo: ItemsRepo, schedule: BookInfoScheduler): ItemsRepo {
  const safe = (item: Item) => {
    try {
      schedule(item);
    } catch {
      // Cover and author are extras: they never fail a save.
    }
  };
  return {
    ...repo,
    async createItem(input, opts) {
      const item = await repo.createItem(input, opts);
      if (needsBookInfo(item)) safe(item);
      return item;
    },
    async updateItem(id, patch) {
      const item = await repo.updateItem(id, patch);
      if (patch.title !== undefined && needsBookInfo(item)) safe(item);
      return item;
    },
  };
}
