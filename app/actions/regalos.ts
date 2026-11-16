'use server';

import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { createGeminiProvider } from '@/lib/ai/gemini';
import { createActionRunner } from '@/lib/actions/run';
import type { ActionResult } from '@/lib/actions/result';
import { sessionDeps } from '@/lib/actions/server';
import { invalidate } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import { addGiftIdea, suggestGifts, type GiftIdeaDeps, type GiftSuggestion } from '@/lib/giftIdeas';
import type { Item } from '@/lib/db/types';

async function giftSession(): Promise<{ userId: string; deps: GiftIdeaDeps }> {
  const { userId, deps } = await sessionDeps();
  return { userId, deps: { ai: createGeminiProvider(), items: deps.items, people: deps.people } };
}

const run = createActionRunner<GiftIdeaDeps>({ session: giftSession, invalidate, rethrow: unstable_rethrow });

const idSchema = z.string().min(1).max(100);
const occasionSchema = z.string().trim().max(60).optional();
const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(200).default(''),
  approxPrice: z.number().positive().optional(),
});

/** "Sugerir ideas": one AI call, only when Marc presses the button. Nothing is saved. */
export async function suggestGiftIdeas(personId: unknown, occasion?: unknown): Promise<ActionResult<GiftSuggestion[]>> {
  const id = idSchema.safeParse(personId);
  const occ = occasionSchema.safeParse(occasion);
  if (!id.success || !occ.success) return { ok: false, error: 'No se pueden sugerir ideas para eso.' };
  return run([], (deps) => suggestGifts(deps, id.data, occ.data || undefined), 'No he podido pensar ideas ahora. Inténtalo dentro de un rato.');
}

/** Files a chosen suggestion as a regalo idea for the person. */
export async function addSuggestedGift(personId: unknown, suggestion: unknown): Promise<ActionResult<Item>> {
  const id = idSchema.safeParse(personId);
  const s = suggestionSchema.safeParse(suggestion);
  if (!id.success || !s.success) return { ok: false, error: 'Esa idea no es válida.' };
  return run(WRITES.item, (deps) => addGiftIdea(deps, id.data, s.data), 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.');
}
