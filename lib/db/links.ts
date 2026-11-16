import type { SupabaseClient } from '@supabase/supabase-js';
import { safeHref } from '@/lib/links/linkify';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';
import { domainOf } from './stores';

/** One of the links of an item (item_links, 0011), with its preview. */
export interface ItemLink {
  id: string;
  itemId: string;
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string | null;
  favicon: string | null;
  position: number;
}

export type NewLink = Pick<ItemLink, 'url'> & Partial<Pick<ItemLink, 'title' | 'description' | 'image' | 'favicon'>>;
export type LinkPatch = Partial<Pick<ItemLink, 'title' | 'description' | 'image' | 'favicon'>>;

export interface LinksRepo {
  /** The links of one item in order, or every link when no item is given. */
  listLinks(itemId?: string): Promise<ItemLink[]>;
  /** Normalised http(s) URL; the same URL on the same item is returned, not repeated. Throws on anything else. */
  addLink(itemId: string, link: NewLink): Promise<ItemLink>;
  updateLink(id: string, patch: LinkPatch): Promise<ItemLink>;
  removeLink(id: string): Promise<void>;
  removeLinksOf(itemId: string): Promise<void>;
}

export function rowToLink(row: Row): ItemLink {
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    url: String(row.url),
    title: text(row.title),
    description: text(row.description),
    image: text(row.image),
    domain: text(row.domain),
    favicon: text(row.favicon),
    position: Number(row.position ?? 0),
  };
}

const byItemThenPosition = (a: ItemLink, b: ItemLink) => a.itemId.localeCompare(b.itemId) || a.position - b.position;

export function createLinksRepo(backend: DbBackend): LinksRepo {
  return {
    async listLinks(itemId) {
      const rows = await backend.select('item_links', itemId ? { eq: { item_id: itemId } } : undefined);
      return rows.map(rowToLink).sort(byItemThenPosition);
    },

    async addLink(itemId, link) {
      const url = safeHref(link.url.trim());
      if (!url) throw new Error('El enlace no es una URL http(s) válida');
      const existing = await backend.select('item_links', { eq: { item_id: itemId } });
      const same = existing.find((r) => r.url === url);
      if (same) return rowToLink(same);
      return rowToLink(
        await backend.insert('item_links', {
          item_id: itemId,
          url,
          title: link.title ?? null,
          description: link.description ?? null,
          image: link.image ?? null,
          favicon: link.favicon ?? null,
          domain: domainOf(url),
          position: existing.length,
        }),
      );
    },

    async updateLink(id, patch) {
      const row: Row = {};
      for (const k of ['title', 'description', 'image', 'favicon'] as const) if (patch[k] !== undefined) row[k] = patch[k];
      return rowToLink(await backend.update('item_links', id, row));
    },

    async removeLink(id) {
      await backend.remove('item_links', { eq: { id } });
    },

    async removeLinksOf(itemId) {
      await backend.remove('item_links', { eq: { item_id: itemId } });
    },
  };
}

export function createSupabaseLinksRepo(client: SupabaseClient, opts: { userId?: string } = {}): LinksRepo {
  return createLinksRepo(createSupabaseBackend(client, opts));
}
