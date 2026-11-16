/**
 * Compras: grouping by store or by urgency, and the estimated totals. Pure (no server imports),
 * used by the screen and the "En la tienda" mode.
 */
import type { Item } from '@/lib/db/types';

export interface StoreInfo {
  id: string;
  name: string;
  domain: string | null;
  favicon: string | null;
}

export interface Total {
  /** In `currency`. */
  amount: number;
  currency: string;
  /** Lines without a price: the total is a floor, and the screen says so. */
  unpriced: number;
}

export interface CompraGroup {
  key: string;
  title: string;
  store: StoreInfo | null;
  items: Item[];
  total: Total | null;
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const currencyOf = (item: Item) => (typeof item.data.currency === 'string' ? item.data.currency : 'EUR');
const quantityOf = (item: Item) => num(item.data.quantity) ?? 1;
const cents = (n: number) => Math.round(n * 100);

/** Price × quantity of one purchase, or null without a price. */
export function lineTotal(item: Item): number | null {
  const price = num(item.data.price);
  return price === null ? null : cents(price) * quantityOf(item) / 100;
}

/** "25,00 €", or "2 × 12,50 €" for several units; null without a price. */
export function priceText(item: Item): string | null {
  const price = num(item.data.price);
  if (price === null) return null;
  const quantity = quantityOf(item);
  const one = formatMoney(price, currencyOf(item));
  return quantity > 1 ? `${quantity} × ${one}` : one;
}

/** The estimated total of some purchases; null with no prices at all or with mixed currencies. */
export function totalOf(items: Item[]): Total | null {
  let sum = 0;
  let priced = 0;
  const currencies = new Set<string>();
  for (const item of items) {
    const line = lineTotal(item);
    if (line === null) continue;
    priced++;
    sum += cents(line);
    currencies.add(currencyOf(item));
  }
  if (priced === 0 || currencies.size !== 1) return null;
  return { amount: sum / 100, currency: [...currencies][0], unpriced: items.length - priced };
}

const newestFirst = (a: Item, b: Item) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/** One section per store (alphabetical), "Sin tienda" last; a store that no longer exists counts as none. */
export function groupByStore(items: Item[], stores: StoreInfo[]): CompraGroup[] {
  const byId = new Map(stores.map((s) => [s.id, s]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.storeId && byId.has(item.storeId) ? item.storeId : '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const out: CompraGroup[] = [...groups.entries()].map(([key, list]) => {
    const store = key ? (byId.get(key) ?? null) : null;
    const sorted = [...list].sort(newestFirst);
    return { key: key || 'sin-tienda', title: store?.name ?? 'Sin tienda', store, items: sorted, total: totalOf(sorted) };
  });
  return out.sort((a, b) => (a.store ? 0 : 1) - (b.store ? 0 : 1) || a.title.localeCompare(b.title, 'es'));
}

const URGENCY: { key: string; title: string }[] = [
  { key: 'alta', title: 'Urgente' },
  { key: 'media', title: 'Media' },
  { key: 'baja', title: 'Baja' },
  { key: 'sin', title: 'Sin urgencia' },
];

/** Urgent first; only the sections that have something. */
export function groupByUrgency(items: Item[]): CompraGroup[] {
  return URGENCY.flatMap(({ key, title }) => {
    const list = items.filter((i) => (typeof i.data.urgency === 'string' ? i.data.urgency : 'sin') === key).sort(newestFirst);
    return list.length > 0 ? [{ key, title, store: null, items: list, total: totalOf(list) }] : [];
  });
}
