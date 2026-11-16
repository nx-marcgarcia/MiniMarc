import { describe, expect, it } from 'vitest';
import { emptyIfTableMissing, isMissingTable } from '@/lib/db/missingTable';

describe('isMissingTable', () => {
  it.each([
    'select stores: Could not find the table \'public.stores\' in the schema cache',
    'select item_links: relation "public.item_links" does not exist',
    'select tags: relation "tags" does not exist',
  ])('reconoce «%s»', (m) => expect(isMissingTable(new Error(m))).toBe(true));

  it('no confunde otros errores (red, permisos, columnas)', () => {
    for (const m of ['select stores: permission denied for table stores', 'fetch failed', 'select items: column items.foo does not exist'])
      expect(isMissingTable(new Error(m))).toBe(false);
    expect(isMissingTable('texto')).toBe(false);
  });
});

describe('emptyIfTableMissing', () => {
  it('devuelve [] cuando la tabla aún no existe (migración sin aplicar), para que la página cargue', async () => {
    const r = await emptyIfTableMissing(Promise.reject(new Error("Could not find the table 'public.stores' in the schema cache")));
    expect(r).toEqual([]);
  });

  it('deja pasar lo que sí funciona y los demás errores', async () => {
    expect(await emptyIfTableMissing(Promise.resolve([1]))).toEqual([1]);
    await expect(emptyIfTableMissing(Promise.reject(new Error('permission denied')))).rejects.toThrow('permission denied');
  });
});
