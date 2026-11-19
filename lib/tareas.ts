/**
 * Tareas: the open tasks grouped by when they are due (Madrid days). Pure; the screen draws.
 * Always the same seven groups in the same order (the screen hides the empty ones), so a task
 * added optimistically has a group to land in.
 */
import type { Item } from '@/lib/db/types';
import { isOpen } from '@/lib/items/itemTypes';
import { isRepeat, nextDue } from '@/lib/recurrence';
import { addDays } from '@/lib/agenda/week';
import { isValidDate, madridDateTime } from '@/lib/time';

export type TaskGroupKey = 'atrasadas' | 'hoy' | 'manana' | 'semana' | 'despues' | 'sin-fecha' | 'en-espera';

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
  'en-espera': 'En espera',
};

const ORDER: TaskGroupKey[] = ['atrasadas', 'hoy', 'manana', 'semana', 'despues', 'sin-fecha', 'en-espera'];

/** Whole days from `from` to `to` ("YYYY-MM-DD"). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export const WAITING = 'en_espera';

/** A task waiting for someone or something (status «En espera»): not for doing now, so it makes no noise. */
export function isWaiting(item: Pick<Item, 'type' | 'status'>): boolean {
  return item.type === 'tarea' && item.status === WAITING;
}
/** After this many days in espera with no `reviewOn`, the task asks to be looked at again. */
export const WAITING_FOLLOW_UP_DAYS = 7;

const dateField = (item: Pick<Item, 'data'>, key: string): string | null => {
  const v = item.data[key];
  return typeof v === 'string' && isValidDate(v) ? v : null;
};
export const waitingFor = (item: Pick<Item, 'data'>): string | null => {
  const v = item.data.waitingFor;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};
export const waitingSince = (item: Pick<Item, 'data'>) => dateField(item, 'waitingSince');

/** The day a waiting task asks to be looked at again: its `reviewOn`, else a week after `waitingSince`; null if neither. */
export function followUpOn(item: Pick<Item, 'data'>): string | null {
  const on = dateField(item, 'reviewOn');
  if (on) return on;
  const since = waitingSince(item);
  return since ? addDays(since, WAITING_FOLLOW_UP_DAYS) : null;
}

const WAITING_KEYS = ['waitingFor', 'waitingSince', 'reviewOn'] as const;

/** `data` without the waiting fields (the task is back to being doable, or done). */
export function withoutWaiting(data: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...data };
  for (const key of WAITING_KEYS) delete rest[key];
  return rest;
}
export const hasWaitingData = (data: Record<string, unknown>) => WAITING_KEYS.some((k) => k in data);

/** The task's deadline ("YYYY-MM-DD"), if it has a valid one. */
export function deadlineOf(item: Pick<Item, 'data'>): string | null {
  const d = item.data.deadline;
  return typeof d === 'string' && isValidDate(d) ? d : null;
}

/**
 * Where a task goes: by its planned date; a task past its deadline is Atrasada whatever its
 * planned date, and one with a deadline but no planned date is grouped by the deadline.
 */
export function groupOf(item: Pick<Item, 'dueAt' | 'data' | 'type' | 'status'>, today: string): TaskGroupKey {
  if (isWaiting(item)) return 'en-espera';
  const deadline = deadlineOf(item);
  if (deadline && daysBetween(today, deadline) < 0) return 'atrasadas';
  const date = item.dueAt ? madridDateTime(new Date(item.dueAt)).date : deadline;
  if (!date) return 'sin-fecha';
  const days = daysBetween(today, date);
  if (days < 0) return 'atrasadas';
  if (days === 0) return 'hoy';
  if (days === 1) return 'manana';
  if (days <= 7) return 'semana';
  return 'despues';
}

export function groupTareas(items: Item[], today: string): TaskGroup[] {
  const groups = new Map<TaskGroupKey, Item[]>(ORDER.map((k) => [k, []]));
  for (const item of items) groups.get(groupOf(item, today))!.push(item);
  // Waiting: the longest waiting first.
  groups.get('en-espera')!.sort((a, b) => (waitingSince(a) ?? '9').localeCompare(waitingSince(b) ?? '9'));
  return ORDER.map((key) => ({ key, header: HEADERS[key], items: groups.get(key)! }));
}

/**
 * A repeating task that is open and has a date: completing it moves it to this date (ISO) instead
 * of closing it. null for anything else. Used by the server (toggleDone) and the screen (to show
 * the row moving on at once), so both agree.
 */
export function nextOccurrence(item: Item, now: Date): string | null {
  if (item.type !== 'tarea' || !item.dueAt || !isOpen(item) || !isRepeat(item.data.recurrence)) return null;
  const due = new Date(item.dueAt);
  // After the later of now and the due date: done early, the next one still counts from its date.
  return nextDue(item.dueAt, item.data.recurrence, { after: due > now ? due : now, hasTime: item.hasTime });
}
