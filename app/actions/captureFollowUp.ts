'use server';

import { unstable_rethrow } from 'next/navigation';
import { sessionDeps } from '@/lib/actions/server';
import { createActionRunner } from '@/lib/actions/run';
import type { ActionResult } from '@/lib/actions/result';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { mergeDuplicate } from '@/lib/capture/duplicates';
import {
  correctCaptured,
  correctionInputSchema,
  undoCaptured,
  undoInputSchema,
  type FollowUpDeps,
} from '@/lib/capture/followUp';
import { emptyIfTableMissing } from '@/lib/db/missingTable';
import { createSupabaseCaptureLogRepo } from '@/lib/db/captureLog';
import { createSupabaseStoresRepo } from '@/lib/db/stores';
import type { Item } from '@/lib/db/types';
import { createClient } from '@/lib/supabase/server';

/** The signed-in user's repos for what follows a capture (RLS scopes every query to Marc). */
async function followUpSession(): Promise<{ userId: string; deps: FollowUpDeps }> {
  const [{ userId, deps }, client] = await Promise.all([sessionDeps(), createClient()]);
  return {
    userId,
    deps: {
      ...deps,
      stores: createSupabaseStoresRepo(client),
      log: createSupabaseCaptureLogRepo(client),
      calendar: () => calendarGatewayFor(userId),
    },
  };
}

const run = createActionRunner<FollowUpDeps>({ session: followUpSession, invalidate, rethrow: unstable_rethrow });

const FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** A chip of the capture toast: change an item's type, person or store. */
export async function correctCapture(input: unknown): Promise<ActionResult<Item>> {
  const parsed = correctionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Corrección no válida.' };
  return run(WRITES.capture, (deps) => correctCaptured(deps, parsed.data), FAILED);
}

/** "Deshacer" on the capture toast: its items to the Papelera, its citas out of Calendar. */
export async function undoCapture(input: unknown): Promise<ActionResult<{ deleted: number; eventsFailed: number }>> {
  const parsed = undoInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'No se puede deshacer.' };
  return run(WRITES.capture, (deps) => undoCaptured(deps, parsed.data), FAILED);
}

/** "Es el mismo": keeps the item Marc already had, with what the new one added. */
export async function mergeCaptureDuplicate(newId: string, existingId: string): Promise<ActionResult<Item>> {
  if (typeof newId !== 'string' || typeof existingId !== 'string' || !newId || !existingId) {
    return { ok: false, error: 'No se pueden fusionar.' };
  }
  return run(WRITES.capture, (deps) => mergeDuplicate(deps.items, newId, existingId), FAILED);
}

/** People and stores for the capture toast's chips. */
export async function listCaptureChoices(): Promise<ActionResult<{ people: { id: string; name: string }[]; stores: { id: string; name: string }[] }>> {
  return run(
    [],
    async (deps) => {
      const [people, stores] = await Promise.all([deps.people.listPeople(), emptyIfTableMissing(deps.stores.listStores())]);
      return {
        people: people.map(({ id, name }) => ({ id, name })),
        stores: stores.map(({ id, name }) => ({ id, name })),
      };
    },
    'No se han podido cargar las opciones.',
  );
}
