/**
 * The reminder slots of a day and which one is due now. The cron runs every 30 minutes and the
 * server decides here, with the Madrid clock, whether it is time (no fixed UTC hours anywhere).
 *
 * Idempotent: `lastSlot` is the last slot sent ("YYYY-MM-DD HH:mm"); a slot is due once, and if
 * the cron was down for a while only the latest missed slot goes out (no flood). Pure.
 */
import { madridDateTime, DEFAULT_TZ } from '@/lib/time';
import { inWindow, WINDOW_END_HOUR, WINDOW_START_HOUR } from './window';

export interface SlotSettings {
  tz: string;
  /** The briefing hour of Ajustes; the window opens at 9:00, so earlier values mean 9:00. */
  digestHour: number;
  /** "HH:mm", sorted (Settings.reminderTimes). */
  reminderTimes: string[];
  skipHolidays: boolean;
  lastSlot: string | null;
}

export const briefingHour = (s: Pick<SlotSettings, 'digestHour'>): number =>
  Math.min(Math.max(s.digestHour, WINDOW_START_HOUR), WINDOW_END_HOUR - 1);

/** The day's reminder slots inside the window, apart from the minute the briefing goes out. */
export function reminderSlots(date: string, s: SlotSettings): string[] {
  const briefing = `${String(briefingHour(s)).padStart(2, '0')}:00`;
  return s.reminderTimes
    .filter((t) => {
      const hour = Number(t.slice(0, 2));
      return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR && t !== briefing;
    })
    .map((t) => `${date} ${t}`);
}

/** The slot to send now, or null (outside the window, nothing new due, or already sent). */
export function dueReminderSlot(now: Date, s: SlotSettings): string | null {
  const tz = s.tz || DEFAULT_TZ;
  if (!inWindow(now, { skipHolidays: s.skipHolidays, tz })) return null;
  const { date, time } = madridDateTime(now, tz);
  const due = reminderSlots(date, s).filter((key) => key.slice(11) <= time && key > (s.lastSlot ?? ''));
  return due.length ? due[due.length - 1] : null;
}
