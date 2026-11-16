import { toMadrid } from '@/lib/time';
import { inWindow } from '@/lib/resurfacing/window';
import { briefingHour } from '@/lib/resurfacing/slots';

export interface DigestSchedule {
  /** Local hour of Ajustes from which the briefing may go out; the window opens at 9:00, so earlier means 9:00. */
  digestHour: number;
  tz: string;
  /** Local date ("YYYY-MM-DD") of the last digest sent, or null. */
  lastDigestDate: string | null;
  /** Skip national and Comunidad Valenciana holidays (default true). */
  skipHolidays?: boolean;
}

/**
 * True once per day, only Monday to Friday between 9:00 and 16:00 Madrid time, from the briefing
 * hour on. The cron runs every 30 minutes and decides here with the zone's clock (never fixed UTC
 * hours, so the DST change cannot break it). A run that failed is retried by the next one inside
 * the window; on a weekend or holiday nothing goes out and Monday's briefing carries what is pending.
 */
export function shouldSendDigest(now: Date, s: DigestSchedule): boolean {
  if (!inWindow(now, { skipHolidays: s.skipHolidays ?? true, tz: s.tz })) return false;
  const local = toMadrid(now, s.tz);
  return local.hour >= briefingHour(s) && s.lastDigestDate !== local.date;
}
