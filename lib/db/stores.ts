import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { nameKey } from '@/lib/search/normalize';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';

export const STORE_KINDS = ['online', 'fisica'] as const;
export type StoreKind = (typeof STORE_KINDS)[number];

export interface Store {
  id: string;
  name: string;
  /** "aliexpress.com" (no www, no path). */
  domain: string | null;
  kind: StoreKind;
  favicon: string | null;
}

export interface StoresRepo {
  /** Alphabetical. */
  listStores(): Promise<Store[]>;
  /**
   * The store with that name (found without case, accents or extra spaces), created if missing.
   * Repeating it with a domain adds the domain to a store that had none; nothing else is rewritten.
   * Throws on an empty name or an unknown kind.
   */
  upsertStoreByName(name: string, opts?: { domain?: string; kind?: StoreKind }): Promise<Store>;
  /** The store whose domain is the link's (or the domain's) host, if any. */
  findStoreByDomain(urlOrDomain: string): Promise<Store | null>;
}

const kindSchema = z.enum(STORE_KINDS);

/**
 * "aliexpress.com" from a link ("https://www.aliexpress.com/item/1.html", "www.casio.com/es") or
 * from a bare domain; null for anything that is not a domain (a name, javascript:…). Pure.
 */
export function domainOf(text: string): string | null {
  let s = text.trim();
  if (/^https?:\/\//i.test(s)) s = s.replace(/^https?:\/\//i, '');
  else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null;
  const host = s.split(/[/?#]/)[0].replace(/^www\./i, '').toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** The site's own favicon: no third-party service sees which stores Marc uses. */
const faviconOf = (domain: string) => `https://${domain}/favicon.ico`;

export function rowToStore(row: Row): Store {
  return {
    id: String(row.id),
    name: String(row.name),
    domain: (row.domain as string | null) ?? null,
    kind: row.kind === 'fisica' ? 'fisica' : 'online',
    favicon: (row.favicon as string | null) ?? null,
  };
}

export function createStoresRepo(backend: DbBackend): StoresRepo {
  return {
    async listStores() {
      const rows = await backend.select('stores');
      return rows.map(rowToStore).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    },

    async upsertStoreByName(name, opts = {}) {
      const clean = name.trim().replace(/\s+/g, ' ');
      if (!clean) throw new Error('El nombre no puede estar vacío');
      const kind = opts.kind === undefined ? undefined : kindSchema.parse(opts.kind);
      const domain = opts.domain ? domainOf(opts.domain) : null;
      const key = nameKey(clean);
      const found = (await backend.select('stores')).find((r) => nameKey(String(r.name)) === key);
      if (found) {
        if (domain && !found.domain) {
          return rowToStore(await backend.update('stores', String(found.id), { domain, favicon: faviconOf(domain) }));
        }
        return rowToStore(found);
      }
      return rowToStore(
        await backend.insert('stores', {
          name: clean,
          domain,
          kind: kind ?? 'online',
          favicon: domain ? faviconOf(domain) : null,
        }),
      );
    },

    async findStoreByDomain(urlOrDomain) {
      const domain = domainOf(urlOrDomain);
      if (!domain) return null;
      const [row] = await backend.select('stores', { eq: { domain } });
      return row ? rowToStore(row) : null;
    },
  };
}

export function createSupabaseStoresRepo(client: SupabaseClient, opts: { userId?: string } = {}): StoresRepo {
  return createStoresRepo(createSupabaseBackend(client, opts));
}
