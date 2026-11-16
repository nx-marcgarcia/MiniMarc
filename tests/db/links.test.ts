import { beforeEach, describe, expect, it } from 'vitest';
import { createLinksRepo, type LinksRepo } from '@/lib/db/links';
import { createMemoryBackend } from '@/lib/db/memory';

let links: LinksRepo;

beforeEach(() => {
  links = createLinksRepo(createMemoryBackend());
});

describe('enlaces de un item', () => {
  it('guarda la URL normalizada y su dominio', async () => {
    const l = await links.addLink('item-1', { url: 'www.casio.com/es/x' });
    expect(l).toMatchObject({ itemId: 'item-1', url: 'https://www.casio.com/es/x', domain: 'casio.com', position: 0 });
  });

  it('un item puede tener varios enlaces, en orden', async () => {
    await links.addLink('item-1', { url: 'https://a.com/1' });
    await links.addLink('item-1', { url: 'https://b.com/2' });
    await links.addLink('item-2', { url: 'https://c.com/3' });
    const list = await links.listLinks('item-1');
    expect(list.map((l) => l.url)).toEqual(['https://a.com/1', 'https://b.com/2']);
    expect(list.map((l) => l.position)).toEqual([0, 1]);
  });

  it('el mismo enlace en el mismo item no se repite', async () => {
    const a = await links.addLink('item-1', { url: 'https://a.com/1' });
    const b = await links.addLink('item-1', { url: 'https://a.com/1' });
    expect(b.id).toBe(a.id);
    expect(await links.listLinks('item-1')).toHaveLength(1);
  });

  it('rechaza lo que no es http(s)', async () => {
    await expect(links.addLink('item-1', { url: 'javascript:alert(1)' })).rejects.toThrow();
    await expect(links.addLink('item-1', { url: 'hola' })).rejects.toThrow();
  });

  it('guarda y actualiza la vista previa', async () => {
    const l = await links.addLink('item-1', { url: 'https://a.com/1' });
    const up = await links.updateLink(l.id, { title: 'Reloj', image: 'https://a.com/i.png', description: 'd', favicon: 'f' });
    expect(up).toMatchObject({ title: 'Reloj', image: 'https://a.com/i.png', description: 'd', favicon: 'f' });
  });

  it('removeLink borra uno; removeLinksOf borra los de un item', async () => {
    const a = await links.addLink('item-1', { url: 'https://a.com/1' });
    await links.addLink('item-1', { url: 'https://a.com/2' });
    await links.addLink('item-2', { url: 'https://b.com/1' });
    await links.removeLink(a.id);
    expect(await links.listLinks('item-1')).toHaveLength(1);
    await links.removeLinksOf('item-1');
    expect(await links.listLinks('item-1')).toEqual([]);
    expect(await links.listLinks('item-2')).toHaveLength(1);
  });

  it('listLinks sin item devuelve todos', async () => {
    await links.addLink('item-1', { url: 'https://a.com/1' });
    await links.addLink('item-2', { url: 'https://b.com/1' });
    expect(await links.listLinks()).toHaveLength(2);
  });
});
