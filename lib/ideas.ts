/**
 * Ideas: filters (state, category, tag), the options those filters offer and the order of the list.
 * An idea is not completed with a check: it moves through its states (semilla → explorando →
 * en marcha, or descartada), so the screen has a state selector instead of a circle. Pure.
 */
import { ITEM_TYPES } from '@/lib/items/itemTypes';
import type { Item } from '@/lib/db/types';

/** Life-cycle order, as the registry declares it. */
export const IDEA_STATE_ORDER: string[] = ITEM_TYPES.idea.states.map((s) => s.id);

const DISCARDED = 'descartada';

export interface IdeaFilters {
  status?: string;
  category?: string;
  tag?: string;
}

export interface Option {
  value: string;
  count: number;
}

const categoryOf = (i: Item): string | null => (typeof i.data.category === 'string' && i.data.category ? i.data.category : null);

/** Archived ideas never show. Discarded ones only show when that state is picked. */
export function filterIdeas(ideas: Item[], f: IdeaFilters): Item[] {
  return ideas.filter(
    (i) =>
      !i.archived &&
      (f.status ? i.status === f.status : i.status !== DISCARDED) &&
      (!f.category || categoryOf(i) === f.category) &&
      (!f.tag || i.tags.includes(f.tag)),
  );
}

function count(values: string[]): Option[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, n]) => ({ value, count: n }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'es'));
}

export const categoriesIn = (ideas: Item[]): Option[] => count(ideas.flatMap((i) => categoryOf(i) ?? []));
export const tagsIn = (ideas: Item[]): Option[] => count(ideas.flatMap((i) => i.tags));

/** The states that have ideas, in life-cycle order. */
export function statesIn(ideas: Item[]): { value: string; label: string; count: number }[] {
  return ITEM_TYPES.idea.states
    .map((s) => ({ value: s.id, label: s.label, count: ideas.filter((i) => i.status === s.id).length }))
    .filter((s) => s.count > 0);
}

const potentialOf = (i: Item): number => (typeof i.data.potential === 'number' ? i.data.potential : 0);

/** Higher potential first, then newest first. */
export function sortIdeas(ideas: Item[]): Item[] {
  return [...ideas].sort((a, b) => potentialOf(b) - potentialOf(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
