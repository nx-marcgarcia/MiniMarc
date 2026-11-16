import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createTagsRepo, tagName, type TagsRepo } from '@/lib/db/tags';

let tags: TagsRepo;

beforeEach(() => {
  tags = createTagsRepo(createMemoryBackend());
});

describe('tagName', () => {
  it('quita la # y los espacios y deja en minúsculas', () => {
    expect(tagName('  #Viajes ')).toBe('viajes');
    expect(tagName('Mamá')).toBe('mamá');
  });

  it('un tag vacío lanza', () => {
    expect(() => tagName(' # ')).toThrow();
  });
});

describe('tags', () => {
  it('reutiliza un tag existente aunque cambien mayúsculas, acentos o la #', async () => {
    const a = await tags.upsertTagByName('Regalo');
    const b = await tags.upsertTagByName('#regalo');
    expect(b.id).toBe(a.id);
    expect(await tags.listTags()).toHaveLength(1);
  });

  it('crea con color y no lo pisa al repetir sin color', async () => {
    await tags.upsertTagByName('viajes', '#336699');
    const again = await tags.upsertTagByName('viajes');
    expect(again.color).toBe('#336699');
  });

  it('rechaza un color que no es #rrggbb', async () => {
    await expect(tags.upsertTagByName('x', 'rojo')).rejects.toThrow();
  });

  it('upsertTags devuelve los nombres normalizados, sin repetidos', async () => {
    expect(await tags.upsertTags(['Viajes', '#viajes', 'Casa', ''])).toEqual(['viajes', 'casa']);
    expect((await tags.listTags()).map((t) => t.name)).toEqual(['casa', 'viajes']);
  });
});
