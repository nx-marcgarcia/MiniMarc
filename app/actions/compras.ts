'use server';

import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { createActionRunner } from '@/lib/actions/run';
import type { ActionResult } from '@/lib/actions/result';
import { sessionDeps } from '@/lib/actions/server';
import { invalidate } from '@/lib/cache/server';
import { createSupabaseStoresRepo } from '@/lib/db/stores';
import { applySplit, suggestSplit, type SplitDeps, type SplitProposal } from '@/lib/splitCompra';
import { createClient } from '@/lib/supabase/server';

async function splitSession(): Promise<{ userId: string; deps: SplitDeps }> {
  const [{ userId, deps }, client] = await Promise.all([sessionDeps(), createClient()]);
  return { userId, deps: { ai: createGeminiProvider(), items: deps.items, stores: createSupabaseStoresRepo(client) } };
}

const run = createActionRunner<SplitDeps>({ session: splitSession, invalidate, rethrow: unstable_rethrow });

const idSchema = z.string().min(1).max(100);

/** "Separar en productos", step 1: what the AI sees in the purchase. One call per click; saves nothing. */
export async function suggestCompraSplit(itemId: unknown): Promise<ActionResult<SplitProposal>> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: 'No se puede separar esa compra.' };
  return run([], (deps) => suggestSplit(deps, id.data), 'No he podido separarlo ahora. Inténtalo dentro de un rato.');
}

/** Step 2, after the preview: one purchase per product, the original archived. */
export async function splitCompraItem(itemId: unknown, input: unknown): Promise<ActionResult<{ count: number }>> {
  const id = idSchema.safeParse(itemId);
  if (!id.success) return { ok: false, error: 'No se puede separar esa compra.' };
  return run(['items'], async (deps) => ({ count: (await applySplit(deps, id.data, input)).length }), 'No se ha podido separar. No se ha cambiado nada.');
}
