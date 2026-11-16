/**
 * Regalos: the next occasions (birthdays and special dates) next to the gifts for that person, and
 * the warning when a date is close and nothing has been bought. Pure; the screen only draws.
 */
import { formatMoney } from '@/lib/compras';
import type { UpcomingDate } from '@/lib/db/people';
import type { Item } from '@/lib/db/types';
import { nameKey } from '@/lib/search/normalize';

/** Days before an occasion when "no gift bought yet" starts to show. */
export const WARN_WITHIN_DAYS = 30;

/** A gift that is bought or wrapped is, for the warning, taken care of. */
const BOUGHT = ['comprado', 'envuelto'];

export interface Occasion {
  upcoming: UpcomingDate;
  /** Open gifts for that person that still are only ideas. */
  ideas: Item[];
  bought: boolean;
  /** The date is within the warning window and there is no bought gift. */
  needsGift: boolean;
}

const forOccasion = (gift: Item, label: string): boolean => {
  const occasion = typeof gift.data.occasion === 'string' ? gift.data.occasion : '';
  return !occasion || nameKey(occasion) === nameKey(label);
};

/** `gifts` are the open ones (not yet delivered). Occasions come out soonest first. */
export function occasionsWithGifts(upcoming: UpcomingDate[], gifts: Item[], opts: { warnWithinDays?: number } = {}): Occasion[] {
  const within = opts.warnWithinDays ?? WARN_WITHIN_DAYS;
  return [...upcoming]
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .map((u) => {
      const mine = gifts.filter((g) => g.personId === u.person.id && forOccasion(g, u.label));
      const bought = mine.some((g) => BOUGHT.includes(g.status));
      return {
        upcoming: u,
        ideas: mine.filter((g) => g.status === 'idea'),
        bought,
        needsGift: !bought && u.daysUntil <= within,
      };
    });
}

/** "2 ideas · 1 comprado" for a person's open gifts. */
export function giftSummary(gifts: Item[]): string {
  const n = (status: string) => gifts.filter((g) => g.status === status).length;
  const parts: string[] = [];
  if (n('idea')) parts.push(`${n('idea')} ${n('idea') === 1 ? 'idea' : 'ideas'}`);
  if (n('comprado')) parts.push(`${n('comprado')} ${n('comprado') === 1 ? 'comprado' : 'comprados'}`);
  if (n('envuelto')) parts.push(`${n('envuelto')} ${n('envuelto') === 1 ? 'envuelto' : 'envueltos'}`);
  return parts.join(' · ');
}

export interface HistoryRow {
  id: string;
  title: string;
  year: number;
  occasion: string | null;
  price: number | null;
}

/** What was given to a person, newest first, so the same thing is not given twice. Year: the one saved, else the delivery's, else the creation's. */
export function giftHistory(gifts: Item[]): HistoryRow[] {
  const given = gifts
    .filter((g) => g.status === 'entregado')
    .map((g) => {
      const at = g.completedAt ?? g.createdAt;
      const row: HistoryRow = {
        id: g.id,
        title: g.title,
        year: typeof g.data.givenYear === 'number' ? g.data.givenYear : Number(at.slice(0, 4)),
        occasion: typeof g.data.occasion === 'string' ? g.data.occasion : null,
        price: typeof g.data.approxPrice === 'number' ? g.data.approxPrice : null,
      };
      return { row, at: Date.parse(at) };
    });
  return given.sort((a, b) => b.row.year - a.row.year || b.at - a.at).map((g) => g.row);
}

/** "2025 · Navidad · 30,00 €". */
export function historyText(r: HistoryRow): string {
  return [String(r.year), r.occasion, r.price !== null ? formatMoney(r.price, 'EUR') : null].filter(Boolean).join(' · ');
}
