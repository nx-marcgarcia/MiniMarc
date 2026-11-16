import { describe, expect, it } from 'vitest';
import { domainsIn, filterCards, kindsIn, toCards } from '@/lib/enlaces';
import type { ItemLink } from '@/lib/db/links';
import { makeItem } from './screens/setup';

const enlace = (id: string, title: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'enlace', title, status: 'por_ver', area: null, data: {}, createdAt: `2026-11-0${id.length}T10:00:00.000Z`, ...over });
const link = (itemId: string, url: string, over: Partial<ItemLink> = {}): ItemLink => ({
  id: `l-${itemId}`,
  itemId,
  url,
  title: null,
  description: null,
  image: null,
  domain: null,
  favicon: null,
  position: 0,
  ...over,
});

describe('toCards', () => {
  it('une cada enlace con su URL, dominio y miniatura de item_links', () => {
    const cards = toCards([enlace('a', 'Receta', { data: { kind: 'video' } })], [link('a', 'https://www.youtube.com/watch?v=1', { image: 'https://i.ytimg.com/1.jpg', domain: 'youtube.com' })]);
    expect(cards).toEqual([expect.objectContaining({ url: 'https://www.youtube.com/watch?v=1', domain: 'youtube.com', image: 'https://i.ytimg.com/1.jpg', kind: 'video', kindLabel: 'Vídeo' })]);
  });

  it('sin item_links usa el enlace antiguo del item y su vista previa', () => {
    const [c] = toCards([enlace('a', 'x', { link: 'https://blog.example.com/p', linkImage: 'https://blog.example.com/i.png' })], []);
    expect(c).toMatchObject({ url: 'https://blog.example.com/p', domain: 'blog.example.com', image: 'https://blog.example.com/i.png', kind: null, kindLabel: null });
  });

  it('con varios enlaces toma el primero (por posición)', () => {
    const [c] = toCards([enlace('a', 'x')], [link('a', 'https://b.com/2', { position: 1 }), link('a', 'https://a.com/1', { position: 0, id: 'l2' })]);
    expect(c.url).toBe('https://a.com/1');
  });

  it('un enlace sin URL sigue saliendo (solo con título)', () => {
    expect(toCards([enlace('a', 'x')], [])[0]).toMatchObject({ url: null, domain: null, image: null });
  });

  it('lo más reciente primero', () => {
    expect(toCards([enlace('a', 'viejo'), enlace('bb', 'nuevo')], []).map((c) => c.item.id)).toEqual(['bb', 'a']);
  });
});

describe('filtros', () => {
  const cards = toCards(
    [
      enlace('a', 'Receta', { data: { kind: 'video' } }),
      enlace('bb', 'Truco', { data: { kind: 'short' } }),
      enlace('ccc', 'Artículo', { data: { kind: 'articulo' }, status: 'visto' }),
      enlace('dddd', 'Otro vídeo', { data: { kind: 'video' } }),
    ],
    [link('a', 'https://www.youtube.com/1'), link('bb', 'https://www.tiktok.com/2'), link('ccc', 'https://blog.example.com/3'), link('dddd', 'https://youtu.be/4')],
  );

  it('por ver o vistos', () => {
    expect(filterCards(cards, { seen: false }).map((c) => c.item.title).sort()).toEqual(['Otro vídeo', 'Receta', 'Truco']);
    expect(filterCards(cards, { seen: true }).map((c) => c.item.title)).toEqual(['Artículo']);
  });

  it('por tipo y por dominio, combinables', () => {
    expect(filterCards(cards, { seen: false, kind: 'video' }).map((c) => c.item.title).sort()).toEqual(['Otro vídeo', 'Receta']);
    expect(filterCards(cards, { seen: false, domain: 'tiktok.com' }).map((c) => c.item.title)).toEqual(['Truco']);
    expect(filterCards(cards, { seen: false, kind: 'video', domain: 'youtube.com' }).map((c) => c.item.title)).toEqual(['Receta']);
  });

  it('kindsIn y domainsIn ofrecen solo lo que hay, con su número', () => {
    expect(kindsIn(filterCards(cards, { seen: false }))).toEqual([{ value: 'video', label: 'Vídeo', count: 2 }, { value: 'short', label: 'Short', count: 1 }]);
    expect(domainsIn(filterCards(cards, { seen: false }))).toEqual([
      { value: 'tiktok.com', count: 1 },
      { value: 'youtu.be', count: 1 },
      { value: 'youtube.com', count: 1 },
    ]);
  });
});
