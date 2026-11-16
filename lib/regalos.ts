/**
 * Regalos: the next occasions (birthdays and special dates) next to the gifts for that person, and
 * the warning when a date is close and nothing has been bought. Pure; the screen only draws.
 */
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
