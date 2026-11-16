/**
 * Subtareas de una tarea: `data.subtasks`, una lista de { title, done } (registro de tipos).
 * Puro: la hoja las edita en el cliente y viajan en el formulario como JSON.
 */
import { nameKey } from '@/lib/search/normalize';

export interface Subtask {
  title: string;
  done: boolean;
}

/** The list a form carries; anything invalid is dropped (never throws). */
export function parseSubtasks(json: string): Subtask[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Subtask[] = [];
  for (const s of raw) {
    if (typeof s !== 'object' || s === null) continue;
    const { title, done } = s as Record<string, unknown>;
    if (typeof title !== 'string' || typeof done !== 'boolean' || !title.trim()) continue;
    out.push({ title: title.trim(), done });
  }
  return out;
}

/** Adds at the end; blank or already there (same words) leaves the list as it was. */
export function addSubtask(list: Subtask[], title: string): Subtask[] {
  const t = title.trim();
  if (!t || list.some((s) => nameKey(s.title) === nameKey(t))) return list;
  return [...list, { title: t, done: false }];
}

export const toggleSubtask = (list: Subtask[], index: number): Subtask[] =>
  list.map((s, i) => (i === index ? { ...s, done: !s.done } : s));

export const removeSubtask = (list: Subtask[], index: number): Subtask[] => list.filter((_, i) => i !== index);

/** "2/5" for the row; null without subtasks. */
export function subtaskProgress(data: Record<string, unknown>): string | null {
  const list = Array.isArray(data.subtasks) ? (data.subtasks as Subtask[]) : [];
  if (list.length === 0) return null;
  return `${list.filter((s) => s.done).length}/${list.length}`;
}
