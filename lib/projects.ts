/** What a project card and its page say about the project's items. Pure. */
import type { Item, ItemType } from '@/lib/db/types';
import { isOpen } from '@/lib/items/itemTypes';
import { isWaiting } from '@/lib/tareas';

export type ProjectSummary = {
  /** Open items per type. */
  counts: Partial<Record<ItemType, number>>;
  /** The open task due soonest, or the oldest one with no date. */
  nextTask: Item | null;
  /** No open task: the project has no next step (GTD). */
  needsNextStep: boolean;
};

export function projectSummary(items: Item[]): ProjectSummary {
  const open = items.filter(isOpen);
  const counts: Partial<Record<ItemType, number>> = {};
  for (const i of open) counts[i.type] = (counts[i.type] ?? 0) + 1;
  // A task waiting for an answer cannot be the next step.
  const tasks = open.filter((i) => i.type === 'tarea' && !isWaiting(i));
  const dated = tasks.filter((t) => t.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
  const undated = tasks.filter((t) => !t.dueAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { counts, nextTask: dated[0] ?? undated[0] ?? null, needsNextStep: tasks.length === 0 };
}

const PLURALS: Record<ItemType, [string, string]> = {
  tarea: ['tarea', 'tareas'],
  compra: ['compra', 'compras'],
  enlace: ['enlace', 'enlaces'],
  idea: ['idea', 'ideas'],
  nota: ['nota', 'notas'],
  libro: ['libro', 'libros'],
  regalo: ['regalo', 'regalos'],
};

/** Order of the sections in a project's page and of its counts: what to do first. */
export const PROJECT_TYPE_ORDER: readonly ItemType[] = ['tarea', 'compra', 'enlace', 'idea', 'nota', 'libro', 'regalo'];

/** "3 tareas · 2 compras · 1 enlace". */
export function countsText(counts: ProjectSummary['counts']): string {
  return PROJECT_TYPE_ORDER.filter((t) => counts[t])
    .map((t) => `${counts[t]} ${PLURALS[t][counts[t] === 1 ? 0 : 1]}`)
    .join(' · ');
}
