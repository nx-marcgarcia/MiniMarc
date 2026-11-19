/**
 * "Separar en productos": a purchase that is really several (the note "Aliexpress" listing what to
 * buy there) becomes one purchase per product, each with its store. Two steps, so Marc sees it
 * before anything changes:
 *   - `suggestSplit`: one AI call, only when he presses the button. Saves nothing.
 *   - `applySplit`: creates the products and archives the original (Archivo keeps it, nothing is deleted).
 * Purchases of Trabajo never go to the AI.
 */
import { z } from 'zod';
import type { AiProvider } from '@/lib/ai/provider';
import { UserError } from '@/lib/actions/result';
import type { ItemsRepo } from '@/lib/db/items';
import type { StoresRepo } from '@/lib/db/stores';
import type { Item } from '@/lib/db/types';
import { createMigrationAi } from '@/lib/migrate/ai';

export interface SplitDeps {
  ai: AiProvider;
  items: ItemsRepo;
  stores: StoresRepo;
}

export const MAX_PRODUCTS = 12;

const productSchema = z.object({
  title: z.string().trim().min(1).max(120),
  price: z.number().nonnegative().nullable(),
  link: z.url({ protocol: /^https?$/ }).max(2000).nullable(),
  notes: z.string().trim().max(500).nullable(),
});

export const splitInputSchema = z.object({
  store: z.object({ name: z.string().trim().min(1).max(80), domain: z.string().trim().max(120).nullable() }).nullable(),
  products: z.array(productSchema).min(2).max(MAX_PRODUCTS),
});

export type SplitInput = z.infer<typeof splitInputSchema>;
export type SplitProposal = { store: { name: string; domain: string | null } | null; products: z.infer<typeof productSchema>[] };

async function findPurchase(items: ItemsRepo, id: string): Promise<Item> {
  const item = (await items.listItems({ type: 'compra' })).find((i) => i.id === id);
  if (!item) throw new UserError('No encuentro esa compra.');
  return item;
}

/** What the AI sees in the purchase: its products and its store. Nothing is saved. */
export async function suggestSplit(deps: Pick<SplitDeps, 'ai' | 'items'>, id: string): Promise<SplitProposal> {
  const item = await findPurchase(deps.items, id);
  if (item.area === 'trabajo') throw new UserError('Lo de Trabajo no se envía a la IA. Sepáralo a mano.');
  let answer;
  try {
    answer = await createMigrationAi(deps.ai).splitCompra({
      title: item.title,
      notes: item.notes,
      link: item.link,
      linkTitle: item.linkTitle,
    });
  } catch {
    throw new UserError('No he podido separarlo ahora. Inténtalo dentro de un rato.');
  }
  const products = answer.products
    .map((p) => productSchema.safeParse({ title: p.title, price: p.price, link: p.link, notes: p.notes }))
    .flatMap((r) => (r.success ? [r.data] : []))
    .slice(0, MAX_PRODUCTS);
  return { store: answer.store?.name.trim() ? answer.store : null, products };
}

/**
 * One purchase per product (same state, project, tags and area as the original; the store chosen
 * in the preview, else the original's), then the original is archived. If anything fails, what
 * was created is put in the Papelera and the original is left as it was.
 */
export async function applySplit(deps: Pick<SplitDeps, 'items' | 'stores'>, id: string, raw: unknown): Promise<Item[]> {
  const parsed = splitInputSchema.safeParse(raw);
  if (!parsed.success) throw new UserError('Hacen falta al menos dos productos con nombre.');
  const input = parsed.data;
  const item = await findPurchase(deps.items, id);
  if (item.archived) throw new UserError('Esa compra ya está archivada.');
  const created: Item[] = [];
  try {
    const storeId = input.store
      ? (await deps.stores.upsertStoreByName(input.store.name, input.store.domain ? { domain: input.store.domain } : {})).id
      : item.storeId;
    const sourceText = [item.title, item.notes].filter(Boolean).join('\n');
    for (const p of input.products) {
      created.push(
        await deps.items.createItem({
          type: 'compra',
          title: p.title,
          notes: p.notes,
          status: item.status,
          area: item.area,
          storeId,
          link: p.link,
          data: p.price === null ? {} : { price: p.price },
          projectId: item.projectId,
          tags: item.tags,
          sourceText: item.sourceText ?? sourceText,
        }),
      );
    }
    await deps.items.updateItem(item.id, { archived: true });
  } catch (e) {
    await Promise.allSettled(created.map((c) => deps.items.softDeleteItem(c.id)));
    throw e instanceof UserError ? e : new UserError('No se ha podido separar. No se ha cambiado nada.');
  }
  return created;
}
