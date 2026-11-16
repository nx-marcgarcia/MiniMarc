/**
 * Duplicados al capturar: ¿Marc ya tiene esto? El item nuevo se guarda siempre (una captura nunca se
 * pierde) y el resultado avisa de a cuál se parece; el toast ofrece fusionarlos (`mergeDuplicate`).
 * Por texto: mismo título, uno dentro del otro, o las mismas palabras en otro orden. La búsqueda
 * semántica por embeddings llega en la fase 6.
 */
import type { ItemsRepo } from '@/lib/db/items';
import type { Item } from '@/lib/db/types';
import { isOpen } from '@/lib/items/itemTypes';
import { nameKey } from '@/lib/search/normalize';

/** Titles shorter than this never count: "pan" next to "pan" is too little to claim a repeat. */
const MIN_LENGTH = 4;
const JACCARD = 0.75;

const key = (title: string) => nameKey(title).replace(/[,.;:()¡!¿?"]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (k: string) => k.split(' ').filter(Boolean);

function similar(a: string, b: string): boolean {
  if (a.length < MIN_LENGTH || b.length < MIN_LENGTH) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // One inside the other, with substance: more than a single short word.
  if (long.includes(short) && (tokens(short).length >= 2 || short.length >= 8)) return true;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size < 2 || tb.size < 2) return false;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / (ta.size + tb.size - shared) >= JACCARD;
}

/** The open item of the same type (and, for a gift, the same person) that `candidate` looks like, or null. */
export function findDuplicate(
  candidate: { type: string; title: string; personId?: string | null; id?: string },
  existing: Item[],
): Item | null {
  const k = key(candidate.title);
  for (const item of existing) {
    if (item.id === candidate.id || item.deletedAt || !isOpen(item) || item.type !== candidate.type) continue;
    if (candidate.type === 'regalo' && (item.personId ?? null) !== (candidate.personId ?? null)) continue;
    if (similar(k, key(item.title))) return item;
  }
  return null;
}

const joinNotes = (a: string | null, b: string | null) => (a && b && !a.includes(b) ? `${a}\n${b}` : (a ?? b));

/**
 * Keeps the item Marc already had and adds what the new one brought (notes, tags, store, price…;
 * what the old one already said is not overwritten). The repeated item goes to the Papelera, so
 * nothing is lost for 30 days. Throws if either is gone.
 */
export async function mergeDuplicate(items: ItemsRepo, newId: string, existingId: string): Promise<Item> {
  const all = await items.listItems();
  const dup = all.find((i) => i.id === newId);
  const old = all.find((i) => i.id === existingId);
  if (!dup || !old) throw new Error('El elemento ya no existe');
  const merged = await items.updateItem(old.id, {
    notes: joinNotes(old.notes, dup.notes),
    tags: [...old.tags, ...dup.tags.filter((t) => !old.tags.includes(t))],
    storeId: old.storeId ?? dup.storeId,
    link: old.link ?? dup.link,
    priority: old.priority ?? dup.priority,
    data: { ...dup.data, ...old.data },
  });
  await items.softDeleteItem(dup.id);
  return merged;
}
