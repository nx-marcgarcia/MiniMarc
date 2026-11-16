import { describe, expect, it } from 'vitest';
import { enrichBook, withBookInfo } from '@/lib/books/enrich';
import type { BookFetcher } from '@/lib/books/lookup';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';

const OPEN = { docs: [{ title: 'Hábitos atómicos', author_name: ['James Clear'], cover_i: 7, number_of_pages_median: 320 }] };
const fetcher: BookFetcher = async (url) => {
  if (url.startsWith('https://openlibrary.org')) return OPEN;
  throw new Error('sin red');
};
const offline: BookFetcher = async () => {
  throw new Error('sin red');
};

describe('enrichBook', () => {
  it('rellena autor, portada y páginas de un libro que solo tiene título', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const book = await items.createItem({ type: 'libro', title: 'Hábitos atómicos' });
    expect(await enrichBook(items, book, fetcher)).toBe(true);
    const [after] = await items.listItems({ type: 'libro' });
    expect(after).toMatchObject({ author: 'James Clear', data: { cover: 'https://covers.openlibrary.org/b/id/7-M.jpg', pages: 320 } });
    expect(after.title).toBe('Hábitos atómicos');
  });

  it('no pisa lo que Marc ya escribió (autor, páginas, otros campos)', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const book = await items.createItem({ type: 'libro', title: 'Hábitos atómicos', author: 'J. Clear', data: { pages: 400, rating: 5 } });
    await enrichBook(items, book, fetcher);
    const [after] = await items.listItems({ type: 'libro' });
    expect(after.author).toBe('J. Clear');
    expect(after.data).toMatchObject({ pages: 400, rating: 5, cover: expect.stringContaining('covers.openlibrary.org') });
  });

  it('el título que escribió Marc se queda aunque la base de datos lo escriba distinto', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const book = await items.createItem({ type: 'libro', title: 'habitos atomicos' });
    await enrichBook(items, book, fetcher);
    expect((await items.listItems({ type: 'libro' }))[0].title).toBe('habitos atomicos');
  });

  it('sin resultado (o sin red) no toca el libro y dice false', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const book = await items.createItem({ type: 'libro', title: 'Hábitos atómicos' });
    expect(await enrichBook(items, book, offline)).toBe(false);
    expect((await items.listItems({ type: 'libro' }))[0].data).toEqual({});
  });

  it('un libro que ya lo tiene todo no hace ninguna llamada', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const book = await items.createItem({ type: 'libro', title: 'X1', author: 'A', data: { cover: 'https://x.test/c.jpg' } });
    let calls = 0;
    expect(await enrichBook(items, book, async () => (calls++, OPEN))).toBe(false);
    expect(calls).toBe(0);
  });

  it('solo trabaja con libros', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const idea = await items.createItem({ type: 'idea', title: 'Hábitos atómicos' });
    let calls = 0;
    expect(await enrichBook(items, idea, async () => (calls++, OPEN))).toBe(false);
    expect(calls).toBe(0);
  });
});

describe('withBookInfo', () => {
  const setup = () => {
    const scheduled: string[] = [];
    const repo = withBookInfo(createItemsRepo(createMemoryBackend()), (item) => void scheduled.push(item.title));
    return { repo, scheduled };
  };

  it('al crear un libro sin portada o autor, programa la búsqueda', async () => {
    const { repo, scheduled } = setup();
    await repo.createItem({ type: 'libro', title: 'Dune' });
    expect(scheduled).toEqual(['Dune']);
  });

  it('no programa nada para otros tipos ni para un libro completo', async () => {
    const { repo, scheduled } = setup();
    await repo.createItem({ type: 'tarea', title: 'Llamar' });
    await repo.createItem({ type: 'libro', title: 'Completo', author: 'A', data: { cover: 'https://x.test/c.jpg' } });
    expect(scheduled).toEqual([]);
  });

  it('al cambiar el título de un libro que sigue sin portada, vuelve a buscar', async () => {
    const { repo, scheduled } = setup();
    const b = await repo.createItem({ type: 'libro', title: 'Dune', author: 'A', data: { cover: 'https://x.test/c.jpg' } });
    await repo.updateItem(b.id, { status: 'leyendo' });
    expect(scheduled).toEqual([]);
    const c = await repo.createItem({ type: 'libro', title: 'Sin portada', author: 'A' });
    scheduled.length = 0;
    await repo.updateItem(c.id, { title: 'Con otro título' });
    expect(scheduled).toEqual(['Con otro título']);
  });

  it('si programar falla, el guardado no falla', async () => {
    const repo = withBookInfo(createItemsRepo(createMemoryBackend()), () => {
      throw new Error('boom');
    });
    await expect(repo.createItem({ type: 'libro', title: 'Dune' })).resolves.toMatchObject({ title: 'Dune' });
  });
});
