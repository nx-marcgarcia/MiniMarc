import { describe, expect, it } from 'vitest';
import { categoriesIn, filterIdeas, IDEA_STATE_ORDER, sortIdeas, statesIn, tagsIn } from '@/lib/ideas';
import { makeItem } from './screens/setup';

const idea = (id: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'idea', title: `Idea ${id}`, status: 'semilla', area: null, data: {}, tags: [], ...over });

describe('filterIdeas', () => {
  const ideas = [
    idea('a', { status: 'semilla', data: { category: 'negocio' }, tags: ['app'] }),
    idea('b', { status: 'explorando', data: { category: 'contenido' }, tags: ['app', 'video'] }),
    idea('c', { status: 'descartada', data: { category: 'negocio' } }),
    idea('d', { status: 'en_marcha', data: {} }),
  ];

  it('sin filtros esconde las descartadas (están a un filtro de distancia)', () => {
    expect(filterIdeas(ideas, {}).map((i) => i.id)).toEqual(['a', 'b', 'd']);
  });

  it('filtra por estado, y "descartada" las enseña', () => {
    expect(filterIdeas(ideas, { status: 'explorando' }).map((i) => i.id)).toEqual(['b']);
    expect(filterIdeas(ideas, { status: 'descartada' }).map((i) => i.id)).toEqual(['c']);
  });

  it('filtra por categoría y por tag, y se combinan', () => {
    expect(filterIdeas(ideas, { category: 'negocio' }).map((i) => i.id)).toEqual(['a']);
    expect(filterIdeas(ideas, { tag: 'app' }).map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterIdeas(ideas, { tag: 'app', category: 'contenido' }).map((i) => i.id)).toEqual(['b']);
  });

  it('las ideas archivadas no salen nunca', () => {
    expect(filterIdeas([idea('z', { archived: true })], {})).toEqual([]);
  });
});

describe('opciones de filtro', () => {
  const ideas = [
    idea('a', { status: 'semilla', data: { category: 'negocio' }, tags: ['app'] }),
    idea('b', { status: 'semilla', data: { category: 'negocio' }, tags: ['app', 'video'] }),
    idea('c', { status: 'descartada', data: { category: 'contenido' } }),
  ];

  it('cuenta categorías y tags, las más usadas primero', () => {
    expect(categoriesIn(ideas)).toEqual([
      { value: 'negocio', count: 2 },
      { value: 'contenido', count: 1 },
    ]);
    expect(tagsIn(ideas)).toEqual([
      { value: 'app', count: 2 },
      { value: 'video', count: 1 },
    ]);
  });

  it('estados en el orden del ciclo de vida, solo los que tienen ideas', () => {
    expect(statesIn(ideas)).toEqual([
      { value: 'semilla', label: 'Semilla', count: 2 },
      { value: 'descartada', label: 'Descartada', count: 1 },
    ]);
    expect(IDEA_STATE_ORDER).toEqual(['semilla', 'explorando', 'en_marcha', 'descartada']);
  });
});

describe('sortIdeas', () => {
  it('por potencial (mayor primero) y luego más nuevas primero', () => {
    const sorted = sortIdeas([
      idea('a', { data: { potential: 2 }, createdAt: '2026-11-01T10:00:00.000Z' }),
      idea('b', { data: {}, createdAt: '2026-11-05T10:00:00.000Z' }),
      idea('c', { data: { potential: 5 }, createdAt: '2026-11-02T10:00:00.000Z' }),
      idea('d', { data: { potential: 2 }, createdAt: '2026-11-03T10:00:00.000Z' }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'd', 'a', 'b']);
  });
});
