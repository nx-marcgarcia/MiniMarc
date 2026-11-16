/**
 * The app-wide area filter: Personal, Trabajo or Todo. It lives in a cookie (set from any screen)
 * and `?area=` overrides it, so old links like /tareas?area=trabajo and the notices keep working.
 * Only what really has an area follows it: tasks, the Bandeja and projects. Pure.
 */
import type { Area } from '@/lib/db/types';

export type AreaFilter = Area | 'todo';

export const AREA_COOKIE = 'area';
export const AREA_FILTERS: readonly AreaFilter[] = ['personal', 'trabajo', 'todo'];

const isFilter = (v: unknown): v is AreaFilter => typeof v === 'string' && (AREA_FILTERS as readonly string[]).includes(v);

/** `?area=` first (its first value), then the cookie; anything else is Todo. */
export function parseAreaFilter(param: string | string[] | undefined, cookie: string | undefined): AreaFilter {
  const fromParam = Array.isArray(param) ? param[0] : param;
  if (isFilter(fromParam)) return fromParam;
  if (isFilter(cookie)) return cookie;
  return 'todo';
}

/** An item (or project) with no area counts as Personal. */
export function matchesArea(area: Area | null | undefined, filter: AreaFilter): boolean {
  return filter === 'todo' || (area ?? 'personal') === filter;
}

/**
 * The area the capture bar follows: `?area=` if the URL has one, else the filter's cookie (from
 * `document.cookie`), so a work task typed under the Trabajo filter is saved as Trabajo (and never
 * goes to the AI). Null when neither says anything.
 */
export function captureAreaParam(param: string | null, cookieHeader: string): string | null {
  if (param) return param;
  const value = cookieHeader
    .split(';')
    .map((c) => c.trim().split('='))
    .find(([k]) => k === AREA_COOKIE)?.[1];
  return isFilter(value) ? value : null;
}
