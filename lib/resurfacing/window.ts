/**
 * When the brain may speak: Monday to Friday, 9:00 to 16:00 Madrid time (the DST change is solved
 * by asking the clock of the zone, never by fixed UTC hours). Holidays (national and Comunidad
 * Valenciana) are skipped when asked. Pure.
 *
 * The holiday list covers the regional and national ones that fall on a fixed day or on Easter;
 * local holidays of a town are not known. A holiday that the region moves to another day is not
 * followed (weekends never send anyway, so the usual case, a Sunday holiday, only matters when the
 * region moves it to the Monday).
 */
import { DEFAULT_TZ, toMadrid } from '@/lib/time';

export const WINDOW_START_HOUR = 9;
export const WINDOW_END_HOUR = 16;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Gregorian Easter Sunday ("YYYY-MM-DD"), Meeus/Jones/Butcher. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

const cache = new Map<number, Set<string>>();

/** National holidays plus the Comunidad Valenciana ones, as "YYYY-MM-DD". */
export function holidaysOf(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const easter = easterSunday(year);
  const days = new Set<string>([
    // National
    ymd(year, 1, 1),
    ymd(year, 1, 6),
    addDays(easter, -2), // Viernes Santo
    ymd(year, 5, 1),
    ymd(year, 8, 15),
    ymd(year, 10, 12),
    ymd(year, 11, 1),
    ymd(year, 12, 6),
    ymd(year, 12, 8),
    ymd(year, 12, 25),
    // Comunidad Valenciana
    ymd(year, 3, 19), // San José
    addDays(easter, 1), // Lunes de Pascua
    ymd(year, 6, 24), // San Juan
    ymd(year, 10, 9), // Día de la Comunidad Valenciana
  ]);
  cache.set(year, days);
  return days;
}

export function isHoliday(date: string): boolean {
  return holidaysOf(Number(date.slice(0, 4))).has(date);
}

/** Monday to Friday of a local date, and not a holiday when `skipHolidays`. */
export function isSendDay(date: string, opts: { skipHolidays: boolean }): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  if (weekday === 0 || weekday === 6) return false;
  return !(opts.skipHolidays && isHoliday(date));
}

/** Now is a send day and between 9:00 and 16:00 (16:00 itself is out). */
export function inWindow(now: Date, opts: { skipHolidays: boolean; tz?: string }): boolean {
  const local = toMadrid(now, opts.tz ?? DEFAULT_TZ);
  return isSendDay(local.date, opts) && local.hour >= WINDOW_START_HOUR && local.hour < WINDOW_END_HOUR;
}
