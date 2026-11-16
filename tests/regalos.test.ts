import { describe, expect, it } from 'vitest';
import type { UpcomingDate } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';
import { giftSummary, occasionsWithGifts } from '@/lib/regalos';
import { makeItem } from './screens/setup';

const person = (id: string, name: string): Person =>
  ({ id, name, birthday: null, notes: null, alias: [], relation: null, likes: null, dislikes: null, sizes: {}, contact: {} }) as unknown as Person;
const ana = person('p1', 'Ana');
const luis = person('p2', 'Luis');
const upcoming = (p: Person, daysUntil: number, label = 'Cumpleaños'): UpcomingDate => ({
  person: p,
  kind: 'birthday',
  dateId: null,
  label,
  date: '2026-12-01',
  daysUntil,
});
const gift = (id: string, personId: string | null, status: string, data: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'regalo', title: `Regalo ${id}`, status, personId, area: null, data });

describe('occasionsWithGifts', () => {
  it('avisa cuando la fecha está cerca y no hay ningún regalo comprado', () => {
    const [o] = occasionsWithGifts([upcoming(ana, 10)], [gift('a', 'p1', 'idea')]);
    expect(o).toMatchObject({ needsGift: true, bought: false });
    expect(o.ideas).toHaveLength(1);
  });

  it('un regalo comprado o envuelto quita el aviso', () => {
    expect(occasionsWithGifts([upcoming(ana, 10)], [gift('a', 'p1', 'comprado')])[0]).toMatchObject({ needsGift: false, bought: true });
    expect(occasionsWithGifts([upcoming(ana, 10)], [gift('a', 'p1', 'envuelto')])[0].bought).toBe(true);
  });

  it('el regalo de otra persona no cuenta', () => {
    expect(occasionsWithGifts([upcoming(ana, 10)], [gift('a', 'p2', 'comprado')])[0].needsGift).toBe(true);
  });

  it('un regalo comprado para otra ocasión no cuenta', () => {
    const o = occasionsWithGifts([upcoming(ana, 10, 'Cumpleaños')], [gift('a', 'p1', 'comprado', { occasion: 'Navidad' })])[0];
    expect(o.bought).toBe(false);
  });

  it('un regalo comprado para esa ocasión cuenta aunque cambie el texto (mayúsculas, acentos)', () => {
    const o = occasionsWithGifts([upcoming(ana, 10, 'Cumpleaños')], [gift('a', 'p1', 'comprado', { occasion: 'cumpleanos' })])[0];
    expect(o.bought).toBe(true);
  });

  it('lejos de la fecha no avisa todavía (por defecto 30 días)', () => {
    expect(occasionsWithGifts([upcoming(ana, 31)], [])[0].needsGift).toBe(false);
    expect(occasionsWithGifts([upcoming(ana, 30)], [])[0].needsGift).toBe(true);
    expect(occasionsWithGifts([upcoming(ana, 31)], [], { warnWithinDays: 45 })[0].needsGift).toBe(true);
  });

  it('respeta el orden de llegada (la más cercana primero)', () => {
    const list = occasionsWithGifts([upcoming(luis, 20), upcoming(ana, 5)], []);
    expect(list.map((o) => o.upcoming.person.name)).toEqual(['Ana', 'Luis']);
  });
});

describe('giftSummary', () => {
  it('cuenta ideas, comprados y envueltos', () => {
    expect(giftSummary([gift('a', 'p1', 'idea'), gift('b', 'p1', 'idea'), gift('c', 'p1', 'comprado')])).toBe('2 ideas · 1 comprado');
    expect(giftSummary([gift('a', 'p1', 'envuelto')])).toBe('1 envuelto');
    expect(giftSummary([gift('a', 'p1', 'idea')])).toBe('1 idea');
    expect(giftSummary([])).toBe('');
  });
});
