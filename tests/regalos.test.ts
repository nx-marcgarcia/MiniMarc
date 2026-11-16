import { describe, expect, it } from 'vitest';
import type { UpcomingDate } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';
import { formatMoney } from '@/lib/compras';
import { giftHistory, giftSummary, historyText, occasionsWithGifts } from '@/lib/regalos';
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

describe('giftHistory', () => {
  const delivered = (id: string, over: Record<string, unknown> = {}) =>
    makeItem({ id, type: 'regalo', title: `Regalo ${id}`, status: 'entregado', personId: 'p1', area: null, data: {}, ...over });

  it('lista solo lo entregado, lo más reciente primero, con año, ocasión y precio', () => {
    const rows = giftHistory([
      gift('x', 'p1', 'idea'),
      delivered('a', { completedAt: '2024-12-24T10:00:00.000Z', data: { occasion: 'Navidad', approxPrice: 30 } }),
      delivered('b', { completedAt: '2025-12-01T10:00:00.000Z', data: { givenYear: 2025, occasion: 'Cumpleaños' } }),
    ]);
    expect(rows).toEqual([
      { id: 'b', title: 'Regalo b', year: 2025, occasion: 'Cumpleaños', price: null },
      { id: 'a', title: 'Regalo a', year: 2024, occasion: 'Navidad', price: 30 },
    ]);
  });

  it('el año guardado manda sobre la fecha de entrega; sin ninguno usa el de creación', () => {
    const [a] = giftHistory([delivered('a', { completedAt: '2026-01-02T10:00:00.000Z', data: { givenYear: 2019 } })]);
    expect(a.year).toBe(2019);
    const [b] = giftHistory([delivered('b', { completedAt: null, createdAt: '2022-05-05T10:00:00.000Z' })]);
    expect(b.year).toBe(2022);
  });
});

describe('historyText', () => {
  it('une año, ocasión y precio', () => {
    expect(historyText({ id: 'a', title: 'x', year: 2025, occasion: 'Navidad', price: 30 })).toBe(`2025 · Navidad · ${formatMoney(30, 'EUR')}`);
    expect(historyText({ id: 'a', title: 'x', year: 2025, occasion: null, price: null })).toBe('2025');
  });
});
