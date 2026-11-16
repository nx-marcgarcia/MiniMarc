import { cookies } from 'next/headers';
import { AREA_COOKIE, parseAreaFilter, type AreaFilter } from '@/lib/area';

/** The area filter of this request: `?area=` or the cookie (call inside a Suspense boundary). */
export async function currentAreaFilter(searchParams: { area?: string | string[] }): Promise<AreaFilter> {
  return parseAreaFilter(searchParams.area, (await cookies()).get(AREA_COOKIE)?.value);
}
