/**
 * Server wiring of the book lookup: after a save, `after()` (next/server) searches Open Library
 * and Google Books once the response is sent, stores the author/cover with the service-role client
 * scoped to the user, and expires the user's cached lists. Never blocks or fails a save. Server only.
 */
import { after } from 'next/server';
import { revalidateUser } from '@/lib/cache/server';
import { WRITES, type DataScope } from '@/lib/cache/tags';
import { createSupabaseItemsRepo, type ItemsRepo } from '@/lib/db/items';
import type { Item } from '@/lib/db/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { enrichBook, withBookInfo } from './enrich';
import type { BookFetcher } from './lookup';

const LOOKUP_TIMEOUT_MS = 5000;

/** GET JSON from a fixed public API (the hosts are constants in lookup.ts, so no SSRF surface). */
export const serverBookFetcher: BookFetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS), headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export interface ServerBookDeps {
  after: (task: () => Promise<void>) => void;
  /** Looks the book up and stores what is missing; true when something was stored. */
  store: (item: Item) => Promise<boolean>;
  invalidate: (userId: string, scopes: readonly DataScope[]) => void;
}

const realDeps = (userId: string): ServerBookDeps => ({
  after,
  store: (item) => enrichBook(createSupabaseItemsRepo(createAdminClient(), { userId }), item, serverBookFetcher),
  invalidate: revalidateUser,
});

/** `repo`, plus the author and cover fetched after the response when a book is saved without them. */
export function withServerBookInfo(repo: ItemsRepo, userId: string, deps: ServerBookDeps = realDeps(userId)): ItemsRepo {
  return withBookInfo(repo, (item) => {
    deps.after(async () => {
      try {
        if (await deps.store(item)) deps.invalidate(userId, WRITES.preview);
      } catch {
        // Never surfaces: the book keeps what Marc typed.
      }
    });
  });
}
