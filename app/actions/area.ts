'use server';

import { cookies } from 'next/headers';
import { AREA_COOKIE, AREA_FILTERS, type AreaFilter } from '@/lib/area';
import { requireUser } from '@/lib/supabase/server';

const YEAR_S = 365 * 24 * 60 * 60;

/** Remembers the area filter (Personal, Trabajo or Todo) for every screen. */
export async function setAreaFilter(filter: AreaFilter): Promise<void> {
  await requireUser();
  if (!AREA_FILTERS.includes(filter)) return;
  (await cookies()).set(AREA_COOKIE, filter, { path: '/', maxAge: YEAR_S, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}
