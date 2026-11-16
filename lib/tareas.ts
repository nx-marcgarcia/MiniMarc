/**
 * Tareas: the open tasks grouped by when they are due (Madrid days). Pure; the screen draws.
 * Always the same six groups in the same order (the screen hides the empty ones), so a task
 * added optimistically has a group to land in.
 */
import type { Item } from '@/lib/db/types';
import { madridDateTime } from '@/lib/time';

export type TaskGroupKey = 'atrasadas' | 'hoy' | 'manana' | 'semana' | 'despues' | 'sin-fecha';

export interface TaskGroup {
  key: TaskGroupKey;
  header: string;
  items: Item[];
}

const HEADERS: Record<TaskGroupKey, string> = {
  atrasadas: 'Atrasadas',
  hoy: 'Hoy',
  manana: 'Mañana',
  semana: 'Esta semana',
  despues: 'Más adelante',
  'sin-fecha': 'Sin fecha',
};

const ORDER: TaskGroupKey[] = ['atrasadas', 'hoy', 'manana', 'semana', 'despues', 'sin-fecha'];

/** Whole days from `from` to `to` ("YYYY-MM-DD"). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function groupOf(item: Pick<Item, 'dueAt'>, today: string): TaskGroupKey {
  if (!item.dueAt) return 'sin-fecha';
  const days = daysBetween(today, madridDateTime(new Date(item.dueAt)).date);
  if (days < 0) return 'atrasadas';
  if (days === 0) return 'hoy';
  if (days === 1) return 'manana';
  if (days <= 7) return 'semana';
  return 'despues';
}

export function groupTareas(items: Item[], today: string): TaskGroup[] {
  const groups = new Map<TaskGroupKey, Item[]>(ORDER.map((k) => [k, []]));
  for (const item of items) groups.get(groupOf(item, today))!.push(item);
  return ORDER.map((key) => ({ key, header: HEADERS[key], items: groups.get(key)! }));
}
