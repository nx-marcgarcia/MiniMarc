/**
 * Exact-time notices: a task Marc gave a time ("llamar el sábado a las 11"), or any item with a
 * reminder (`remindAt`), goes out at that time even outside the Mon-Fri 9:00-16:00 window.
 *
 * The cron runs every 30 minutes, so an instant counts for the run that is at most 15 minutes before
 * it or 15 minutes after it: each time falls in exactly one run, never two and never none.
 * Pure; Trabajo never goes out (it would end up in Telegram).
 */
import { madridDateTime } from '@/lib/time';
import type { ResurfacingEvent } from '@/lib/db/resurfacing';
import type { Item } from '@/lib/db/types';
import { isOpen } from '@/lib/items/itemTypes';
import type { Candidate } from './candidates';

const MIN = 60_000;
/** Half the cron period. */
const HALF_PERIOD_MIN = 15;

export interface TimedInput {
  now: Date;
  tz: string;
  items: Item[];
  /** Notices already sent (their subject says which time was announced). */
  sent: ResurfacingEvent[];
}

const inRun = (iso: string, now: Date) => {
  const delta = (Date.parse(iso) - now.getTime()) / MIN;
  return delta > -HALF_PERIOD_MIN && delta <= HALF_PERIOD_MIN;
};

export function timedDue(input: TimedInput): Candidate[] {
  const { now, tz } = input;
  const sent = new Set(input.sent.map((e) => e.subject));
  const out: Candidate[] = [];

  for (const item of input.items) {
    if (item.area === 'trabajo' || item.archived || item.needsReview || !isOpen(item)) continue;
    if (item.snoozedUntil && Date.parse(item.snoozedUntil) > now.getTime()) continue;

    const when =
      item.type === 'tarea' && item.hasTime && item.dueAt && inRun(item.dueAt, now)
        ? { at: item.dueAt, prefix: 'timed', label: 'Ahora' }
        : item.remindAt && inRun(item.remindAt, now)
          ? { at: item.remindAt, prefix: 'remind', label: 'Recordatorio' }
          : null;
    if (!when) continue;
    const subject = `${when.prefix}:${item.id}:${when.at}`;
    if (sent.has(subject)) continue;
    const { time } = madridDateTime(new Date(when.at), tz);
    out.push({
      subject,
      itemId: item.id,
      kind: 'con_hora',
      urgent: true,
      rank: 0,
      title: item.title,
      detail: `${when.label}, a las ${time}`,
      askArchive: false,
    });
  }
  return out;
}
