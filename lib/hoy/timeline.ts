/**
 * Hoy's "Tu día": today's Calendar events and timed tasks in one list by time (as Sunsama or
 * Amie do), all-day events apart, and the tasks with no time (overdue first). A task's own copy
 * in the "Tareas" calendar (its `calendarEventId`) is left out: the task row, with its circle,
 * stands for it. Pure.
 */
import type { DigestEvent, DigestTask } from '@/lib/digest/build';
import { byOrder } from '@/lib/digest/build';
import { matchesArea, type AreaFilter } from '@/lib/area';
import { madridDateTime } from '@/lib/time';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineEntry =
  | { kind: 'event'; event: DigestEvent; time: string }
  | { kind: 'task'; task: DigestTask; time: string };

export type DayTimeline = { allDay: DigestEvent[]; timed: TimelineEntry[]; untimed: DigestTask[] };

export function buildDayTimeline(input: {
  events: DigestEvent[];
  tasks: DigestTask[];
  tz: string;
  dayEndsAt: Date;
  /** Which tasks show (default Todo). Copies are recognised from every task, so a hidden work task's copy does not reappear as an event. */
  area?: AreaFilter;
}): DayTimeline {
  const { events, tz } = input;
  const tasks = input.tasks.filter((t) => matchesArea(t.item.area, input.area ?? 'todo'));
  const copies = new Set(input.tasks.map((t) => t.item.calendarEventId).filter((id): id is string => Boolean(id)));
  const allDay: DigestEvent[] = [];
  const timed: (TimelineEntry & { at: number })[] = [];
  for (const event of events) {
    if (copies.has(event.id)) continue;
    const start = Date.parse(event.startsAt);
    if (Date.parse(event.endsAt) - start >= DAY_MS) allDay.push(event);
    else timed.push({ kind: 'event', event, time: madridDateTime(new Date(start), tz).time, at: start });
  }
  const untimed: DigestTask[] = [];
  for (const task of tasks) {
    if (task.overdue || !task.item.hasTime || !task.item.dueAt) {
      untimed.push(task);
      continue;
    }
    const at = Date.parse(task.item.dueAt);
    timed.push({ kind: 'task', task, time: madridDateTime(new Date(at), tz).time, at });
  }
  timed.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1));
  return {
    allDay,
    timed: timed.map((entry): TimelineEntry =>
      entry.kind === 'event' ? { kind: 'event', event: entry.event, time: entry.time } : { kind: 'task', task: entry.task, time: entry.time },
    ),
    untimed: untimed.sort(byOrder),
  };
}
