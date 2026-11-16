/**
 * Enlaces: the saved links to see later, as cards (title, domain, preview image, type), and the
 * filters of the screen (por ver / vistos, by type, by domain). Pure; the screen only draws.
 */
import type { ItemLink } from '@/lib/db/links';
import { domainOf } from '@/lib/db/stores';
import type { Item } from '@/lib/db/types';

export const KIND_LABELS: Record<string, string> = {
  articulo: 'Artículo',
  video: 'Vídeo',
  short: 'Short',
  hilo: 'Hilo',
  herramienta: 'Herramienta',
};

export interface EnlaceCard {
  item: Item;
  url: string | null;
  domain: string | null;
  /** The page's preview image. */
  image: string | null;
  kind: string | null;
  kindLabel: string | null;
}

/** A card per link item, newest first: the first link of the item (or its old `link`) gives URL, domain and image. */
export function toCards(items: Item[], links: ItemLink[]): EnlaceCard[] {
  const first = new Map<string, ItemLink>();
  for (const l of [...links].sort((a, b) => a.position - b.position)) if (!first.has(l.itemId)) first.set(l.itemId, l);
  return [...items]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((item) => {
      const l = first.get(item.id);
      const url = l?.url ?? item.link ?? null;
      const kind = typeof item.data.kind === 'string' ? item.data.kind : null;
      return {
        item,
        url,
        domain: l?.domain ?? (url ? domainOf(url) : null),
        image: l?.image ?? item.linkImage ?? null,
        kind,
        kindLabel: kind ? (KIND_LABELS[kind] ?? null) : null,
      };
    });
}

export interface EnlaceFilters {
  /** false = por ver; true = vistos. */
  seen: boolean;
  kind?: string;
  domain?: string;
}

export function filterCards(cards: EnlaceCard[], f: EnlaceFilters): EnlaceCard[] {
  return cards.filter(
    (c) => (c.item.status === 'visto') === f.seen && (!f.kind || c.kind === f.kind) && (!f.domain || c.domain === f.domain),
  );
}

/** The types among these cards, most frequent first. */
export function kindsIn(cards: EnlaceCard[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.kind && c.kindLabel) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, label: KIND_LABELS[value], count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}

/** The domains among these cards, alphabetical. */
export function domainsIn(cards: EnlaceCard[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.domain) counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value));
}
