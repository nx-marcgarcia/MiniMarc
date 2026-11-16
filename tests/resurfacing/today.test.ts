import { describe, expect, it } from 'vitest';
import type { Candidate } from '@/lib/resurfacing/candidates';
import { pickForToday } from '@/lib/resurfacing/today';

const c = (kind: Candidate['kind'], n: number, urgent = false): Candidate => ({ kind, subject: `item:${kind}${n}`, itemId: `${kind}${n}`, urgent, rank: urgent ? 1 : 6, title: `${kind}${n}`, href: '/x', detail: '', askArchive: false });

describe('pickForToday: lo que se ve en «Para hoy»', () => {
  it('tres como máximo, lo urgente primero', () => {
    const list = [c('atrasada', 1, true), c('atrasada', 2, true), c('idea_olvidada', 1), c('libro_pendiente', 1)];
    expect(pickForToday(list).map((x) => x.subject)).toEqual(['item:atrasada1', 'item:atrasada2', 'item:idea_olvidada1']);
  });

  it('mezcla tipos: no tres atrasadas seguidas si hay de otros tipos', () => {
    const list = [c('atrasada', 1, true), c('atrasada', 2, true), c('atrasada', 3, true), c('garantia', 1, true)];
    expect(pickForToday(list).map((x) => x.kind)).toEqual(['atrasada', 'garantia', 'atrasada']);
  });

  it('lo olvidado nunca desplaza a lo urgente: tres atrasadas y una idea → las tres atrasadas', () => {
    const list = [c('atrasada', 1, true), c('atrasada', 2, true), c('atrasada', 3, true), c('idea_olvidada', 1)];
    expect(pickForToday(list).map((x) => x.kind)).toEqual(['atrasada', 'atrasada', 'atrasada']);
  });

  it('si solo hay de un tipo, salen las tres de ese tipo', () => {
    const list = [c('idea_olvidada', 1), c('idea_olvidada', 2), c('idea_olvidada', 3), c('idea_olvidada', 4)];
    expect(pickForToday(list)).toHaveLength(3);
  });

  it('con menos de tres, las que haya; sin ninguna, nada', () => {
    expect(pickForToday([c('atrasada', 1, true)])).toHaveLength(1);
    expect(pickForToday([])).toEqual([]);
  });

  it('otro máximo', () => {
    expect(pickForToday([c('atrasada', 1, true), c('garantia', 1, true)], 1)).toHaveLength(1);
  });
});
