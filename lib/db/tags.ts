import type { SupabaseClient } from '@supabase/supabase-js';
import { nameKey } from '@/lib/search/normalize';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';

export interface Tag {
  id: string;
  /** Lower case, no leading #. Items keep these names in `items.tags`. */
  name: string;
  /** "#rrggbb" or null. */
  color: string | null;
}

export interface TagsRepo {
  /** Alphabetical. */
  listTags(): Promise<Tag[]>;
  /** The tag with that name (without case, accents or #), created if missing. A color, if given, sets it. */
  upsertTagByName(name: string, color?: string): Promise<Tag>;
  /** Normalised names of the tags, created as needed, without repeats or empty ones, in order. */
  upsertTags(names: string[]): Promise<string[]>;
}

/** "#Viajes " → "viajes". Throws when nothing is left. */
export function tagName(raw: string): string {
  const name = raw.trim().replace(/^#+/, '').trim().toLowerCase();
  if (!name) throw new Error('El tag no puede estar vacío');
  return name;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function rowToTag(row: Row): Tag {
  return { id: String(row.id), name: String(row.name), color: (row.color as string | null) ?? null };
}

export function createTagsRepo(backend: DbBackend): TagsRepo {
  async function upsert(name: string, color?: string): Promise<Tag> {
    const clean = tagName(name);
    if (color !== undefined && !COLOR.test(color)) throw new Error('El color debe ser #rrggbb');
    const key = nameKey(clean);
    const found = (await backend.select('tags')).find((r) => nameKey(String(r.name)) === key);
    if (found) {
      if (color !== undefined && color !== found.color) return rowToTag(await backend.update('tags', String(found.id), { color }));
      return rowToTag(found);
    }
    return rowToTag(await backend.insert('tags', { name: clean, color: color ?? null }));
  }

  return {
    async listTags() {
      return (await backend.select('tags')).map(rowToTag).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    },

    upsertTagByName: upsert,

    async upsertTags(names) {
      const out: string[] = [];
      for (const raw of names) {
        let tag: Tag;
        try {
          tag = await upsert(raw);
        } catch {
          continue; // empty
        }
        if (!out.includes(tag.name)) out.push(tag.name);
      }
      return out;
    },
  };
}

export function createSupabaseTagsRepo(client: SupabaseClient, opts: { userId?: string } = {}): TagsRepo {
  return createTagsRepo(createSupabaseBackend(client, opts));
}
