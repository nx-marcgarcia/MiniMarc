import { addDays } from '@/lib/agenda/week';
import type { WeeklyDigest } from '@/lib/db/settings';
import { briefingHour } from '@/lib/resurfacing/slots';
import { inWindow, isSendDay } from '@/lib/resurfacing/window';
import { toMadrid } from '@/lib/time';

export interface WeeklySchedule {
  weeklyDigest: WeeklyDigest;
  tz: string;
  /** Monday of the last week summarised by the weekly push, or null. */
  lastWeeklyDate: string | null;
  /** Briefing hour of Ajustes (the weekly summary goes out with it). */
  digestHour: number;
  skipHolidays?: boolean;
}

/** Monday of the week of `date` ("YYYY-MM-DD"). */
function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/**
 * The Monday of the week to summarise now, or null. It goes out on the first working day of the
 * week (Monday, or Tuesday when Monday is a holiday) from the briefing hour, inside the Mon-Fri
 * 9:00-16:00 window like everything else: nothing is sent on a Sunday evening any more, so the
 * "domingo" option now means Monday too. Keyed by the week: a week already summarised never repeats.
 * A run that failed is retried by the next one the same day.
 */
export function shouldSendWeekly(now: Date, s: WeeklySchedule): string | null {
  if (s.weeklyDigest === 'off') return null;
  const skipHolidays = s.skipHolidays ?? true;
  if (!inWindow(now, { skipHolidays, tz: s.tz })) return null;
  const local = toMadrid(now, s.tz);
  if (local.hour < briefingHour(s)) return null;
  const monday = mondayOf(local.date);
  let firstDay = monday;
  while (!isSendDay(firstDay, { skipHolidays })) firstDay = addDays(firstDay, 1);
  if (local.date !== firstDay) return null;
  return s.lastWeeklyDate === monday ? null : monday;
}
