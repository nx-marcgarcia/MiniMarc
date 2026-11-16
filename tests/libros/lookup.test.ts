import { describe, expect, it } from 'vitest';
import { lookupBook, parseGoogleBooks, parseOpenLibrary, type BookFetcher } from '@/lib/books/lookup';

const OPEN = {
  docs: [
    { title: 'Hábitos atómicos', author_name: ['James Clear'], cover_i: 12345, number_of_pages_median: 320 },
    { title: 'Otro libro', author_name: ['Alguien'], cover_i: 1 },
  ],
};
const GOOGLE = {
  items: [{ volumeInfo: { title: 'Atomic Habits', authors: ['James Clear'], pageCount: 306, imageLinks: { thumbnail: 'http://books.google.com/x?id=1&zoom=1' } } }],
};

describe('parseOpenLibrary', () => {
  it('toma autor, portada (por su id) y páginas del primer resultado que encaja', () => {
    expect(parseOpenLibrary(OPEN, 'Hábitos atómicos')).toEqual({
      title: 'Hábitos atómicos',
      author: 'James Clear',
      cover: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
      pages: 320,
    });
  });

  it('no se queda con un libro que no es (el título no coincide)', () => {
    expect(parseOpenLibrary(OPEN, 'Cien años de soledad')).toBeNull();
  });

  it('acepta que el resultado tenga el título completo y se buscara una parte', () => {
    expect(parseOpenLibrary({ docs: [{ title: 'El nombre del viento: Crónica del asesino de reyes', author_name: ['Patrick Rothfuss'] }] }, 'El nombre del viento')?.author).toBe('Patrick Rothfuss');
  });

  it('un resultado sin portada ni autor devuelve lo que haya', () => {
    expect(parseOpenLibrary({ docs: [{ title: 'Dune' }] }, 'Dune')).toEqual({ title: 'Dune' });
  });

  it('basura o vacío = null', () => {
    expect(parseOpenLibrary(null, 'x')).toBeNull();
    expect(parseOpenLibrary({ docs: 'no' }, 'x')).toBeNull();
    expect(parseOpenLibrary({ docs: [] }, 'x')).toBeNull();
  });
});

describe('parseGoogleBooks', () => {
  it('la miniatura pasa a https y sin el efecto de página doblada', () => {
    expect(parseGoogleBooks(GOOGLE, 'Atomic Habits')).toEqual({
      title: 'Atomic Habits',
      author: 'James Clear',
      cover: 'https://books.google.com/x?id=1&zoom=1',
      pages: 306,
    });
  });

  it('no encaja = null', () => {
    expect(parseGoogleBooks(GOOGLE, 'Dune')).toBeNull();
  });
});

describe('lookupBook', () => {
  const fetcher = (map: Record<string, unknown>): BookFetcher & { calls: string[] } => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      const key = Object.keys(map).find((k) => url.startsWith(k));
      if (!key) throw new Error('sin red');
      return map[key];
    }) as BookFetcher & { calls: string[] };
    f.calls = calls;
    return f;
  };

  it('usa Open Library y no llama a Google si ya tiene portada y autor', async () => {
    const f = fetcher({ 'https://openlibrary.org/search.json': OPEN });
    const r = await lookupBook('Hábitos atómicos', null, f);
    expect(r).toMatchObject({ author: 'James Clear', cover: expect.stringContaining('12345') });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toContain('title=H%C3%A1bitos+at%C3%B3micos');
  });

  it('con el autor en la búsqueda lo manda para afinar', async () => {
    const f = fetcher({ 'https://openlibrary.org/search.json': OPEN });
    await lookupBook('Hábitos atómicos', 'James Clear', f);
    expect(f.calls[0]).toContain('author=James+Clear');
  });

  it('completa con Google Books lo que Open Library no trajo (portada)', async () => {
    const f = fetcher({
      'https://openlibrary.org/search.json': { docs: [{ title: 'Atomic Habits', author_name: ['James Clear'] }] },
      'https://www.googleapis.com/books/v1/volumes': GOOGLE,
    });
    const r = await lookupBook('Atomic Habits', null, f);
    expect(r).toEqual({ title: 'Atomic Habits', author: 'James Clear', cover: 'https://books.google.com/x?id=1&zoom=1', pages: 306 });
  });

  it('si Open Library cae, prueba Google Books', async () => {
    const f = fetcher({ 'https://www.googleapis.com/books/v1/volumes': GOOGLE });
    expect((await lookupBook('Atomic Habits', null, f))?.author).toBe('James Clear');
  });

  it('si todo cae, null (nunca lanza)', async () => {
    expect(await lookupBook('Atomic Habits', null, fetcher({}))).toBeNull();
  });

  it('un título vacío o demasiado corto no busca', async () => {
    const f = fetcher({});
    expect(await lookupBook('  ', null, f)).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
});
