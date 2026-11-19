'use server';

import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { createActionRunner } from '@/lib/actions/run';
import type { ActionResult } from '@/lib/actions/result';
import { sessionDeps } from '@/lib/actions/server';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import { createSupabaseResurfacingRepo } from '@/lib/db/resurfacing';
import { actOnCandidate, ANSWERS, answerCandidate, type ActDeps, type ActOutcome } from '@/lib/resurfacing/actions';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_TZ } from '@/lib/time';

async function actSession(): Promise<{ userId: string; deps: ActDeps }> {
  const [{ userId, deps }, client] = await Promise.all([sessionDeps(), createClient()]);
  return {
    userId,
    deps: {
      items: deps.items,
      people: deps.people,
      sync: deps.sync,
      resurfacing: createSupabaseResurfacingRepo(client),
      now: () => new Date(),
      tz: process.env.APP_TZ || DEFAULT_TZ,
    },
  };
}

const run = createActionRunner<ActDeps>({ session: actSession, invalidate, rethrow: unstable_rethrow });

const inputSchema = z
  .object({
    subject: z.string().min(1).max(200),
    itemId: z.string().min(1).max(100).nullable(),
    kind: z.enum(['atrasada', 'vence_hoy', 'regalo_sin_comprar', 'garantia', 'compra_urgente', 'idea_olvidada', 'enlace_olvidado', 'libro_pendiente', 'seguimiento', 'tarea_aplazada', 'con_hora']),
  })
  // An item notice names its item; a person's date has none.
  .refine((c) => (c.itemId === null ? c.subject.startsWith('date:') : c.subject === `item:${c.itemId}`), 'Aviso no válido');

/** A button of "Para hoy": Hecho, Posponer 1 semana or Archivar on what the block shows. */
export async function resurfaceAct(candidate: unknown, action: unknown): Promise<ActionResult<ActOutcome['message']>> {
  const c = inputSchema.safeParse(candidate);
  const a = z.enum(['hecho', 'posponer', 'archivar']).safeParse(action);
  if (!c.success || !a.success) return { ok: false, error: 'Eso no se puede hacer.' };
  return run(
    WRITES.item,
    async (deps) => (await actOnCandidate(deps, c.data, a.data)).message,
    'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.',
  );
}

/** The extra answers of "Para hoy": Más adelante, No me recuerdes, En espera. */
export async function resurfaceAnswer(candidate: unknown, answer: unknown): Promise<ActionResult<ActOutcome['message']>> {
  const c = inputSchema.safeParse(candidate);
  const a = z.enum(ANSWERS).safeParse(answer);
  if (!c.success || !a.success) return { ok: false, error: 'Eso no se puede hacer.' };
  return run(
    WRITES.item,
    async (deps) => (await answerCandidate(deps, c.data, a.data)).message,
    'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.',
  );
}
