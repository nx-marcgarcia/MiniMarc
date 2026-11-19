'use server';

import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { setFocus } from '@/lib/actions/focus';
import { createActionRunner } from '@/lib/actions/run';
import type { ActionResult } from '@/lib/actions/result';
import { sessionDeps } from '@/lib/actions/server';
import { madridToday } from '@/lib/actions/today';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';

const run = createActionRunner({ session: sessionDeps, invalidate, rethrow: unstable_rethrow });

const idSchema = z.string().min(1).max(100).nullable();

/** Hoy's «Mi prioridad de hoy»: choose a task (or null to clear it). One at a time. */
export async function setHoyFocus(itemId: unknown): Promise<ActionResult<null>> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: 'No se puede elegir eso.' };
  return run(WRITES.item, async (deps) => {
    await setFocus(deps, id.data, madridToday());
    return null;
  }, 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.');
}
