/**
 * Hoy's "elegir" blocks, from the open tasks: Mi prioridad de hoy (the task Marc chose today), the
 * short ones for "Si tienes 15 minutos" and the list to choose the priority from. Pure; no AI.
 */
import { matchesArea, type AreaFilter } from '@/lib/area';
import type { Item } from '@/lib/db/types';
import { CALM_HEADLINE } from '@/lib/digest/headlines';
import { isOpen } from '@/lib/items/itemTypes';
import { groupOf, isWaiting, type TaskGroupKey } from '@/lib/tareas';

export const QUICK_MINUTES = 15;
export const QUICK_MAX = 3;
export const CHOICES_MAX = 8;

export interface HoyPicks {
  /** The task chosen for today, whatever the area filter. */
  priority: Item | null;
  /** Up to three tasks that take QUICK_MINUTES or less. */
  quick: Item[];
  /** Where to choose the priority from: overdue first, then today, then the rest. */
  choices: Item[];
}

export const EMPTY_PICKS: HoyPicks = { priority: null, quick: [], choices: [] };

const WHEN: Record<TaskGroupKey, number> = { atrasadas: 0, hoy: 1, manana: 2, semana: 3, despues: 4, 'sin-fecha': 5, 'en-espera': 6 };

/** A task that can be done now: open, classified and not waiting for anyone. */
const doable = (i: Item) => i.type === 'tarea' && isOpen(i) && !i.needsReview && !isWaiting(i);

export const estimateOf = (item: Pick<Item, 'data'>): number | null => {
  const m = item.data.estimateMin;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : null;
};

export function hoyPicks(input: { items: Item[]; today: string; area: AreaFilter }): HoyPicks {
  const { today, area } = input;
  const tasks = input.items.filter(doable);
  const priority = tasks.find((i) => i.data.focusOn === today) ?? null;
  const when = (i: Item) => WHEN[groupOf(i, today)];
  const byWhen = (a: Item, b: Item) => when(a) - when(b) || (a.dueAt ?? 'z').localeCompare(b.dueAt ?? 'z') || a.createdAt.localeCompare(b.createdAt);
  const visible = tasks.filter((i) => i.id !== priority?.id && matchesArea(i.area, area));
  return {
    priority,
    quick: visible
      .filter((i) => (estimateOf(i) ?? Infinity) <= QUICK_MINUTES)
      .sort((a, b) => when(a) - when(b) || estimateOf(a)! - estimateOf(b)! || a.createdAt.localeCompare(b.createdAt))
      .slice(0, QUICK_MAX),
    choices: [...visible].sort(byWhen).slice(0, CHOICES_MAX),
  };
}

export const CHOOSE_HEADLINE = 'Sin citas ni tareas con fecha. Elige por dónde empezar.';

/**
 * "Día tranquilo" says there is nothing, which is untrue when there are tasks without a date to
 * choose from: then the headline invites to choose. Any other headline stays as it is.
 */
export function headlineFor(headline: string, picks: HoyPicks): string {
  return headline === CALM_HEADLINE && !picks.priority && picks.choices.length > 0 ? CHOOSE_HEADLINE : headline;
}
