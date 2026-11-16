import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createStoresRepo, domainOf, type StoresRepo } from '@/lib/db/stores';

let stores: StoresRepo;

beforeEach(() => {
  stores = createStoresRepo(createMemoryBackend());
});

describe('domainOf', () => {
  it.each([
    ['https://www.aliexpress.com/item/1.html', 'aliexpress.com'],
    ['http://casio.com/es', 'casio.com'],
    ['www.casadellibro.com/x', 'casadellibro.com'],
    ['casio.com', 'casio.com'],
  ])('%s → %s', (url, domain) => {
    expect(domainOf(url)).toBe(domain);
  });

  it('un texto que no es un dominio no tiene dominio', () => {
    expect(domainOf('Aliexpress')).toBeNull();
    expect(domainOf('javascript:alert(1)')).toBeNull();
    expect(domainOf('')).toBeNull();
  });
});

describe('tiendas', () => {
  it('crea una tienda online por defecto, con su dominio y favicon derivado', async () => {
    const s = await stores.upsertStoreByName('Aliexpress', { domain: 'https://www.aliexpress.com/x' });
    expect(s).toMatchObject({ name: 'Aliexpress', domain: 'aliexpress.com', kind: 'online' });
    expect(s.favicon).toBe('https://aliexpress.com/favicon.ico');
  });

  it('la misma tienda escrita de otra manera es la misma', async () => {
    const a = await stores.upsertStoreByName('Aliexpress');
    const b = await stores.upsertStoreByName('  ALIEXPRESS ');
    expect(b.id).toBe(a.id);
    expect(await stores.listStores()).toHaveLength(1);
  });

  it('al repetirla con dominio, se lo añade si no lo tenía, sin reescribir lo demás', async () => {
    const a = await stores.upsertStoreByName('Casio');
    const b = await stores.upsertStoreByName('casio', { domain: 'casio.com' });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('Casio');
    expect(b.domain).toBe('casio.com');
  });

  it('se encuentra por el dominio de un enlace', async () => {
    const s = await stores.upsertStoreByName('Casio', { domain: 'casio.com' });
    expect((await stores.findStoreByDomain('https://www.casio.com/es/watches/x'))?.id).toBe(s.id);
    expect(await stores.findStoreByDomain('https://otra.com')).toBeNull();
    expect(await stores.findStoreByDomain('no es un enlace')).toBeNull();
  });

  it('un nombre vacío lanza; el tipo debe ser online o fisica', async () => {
    await expect(stores.upsertStoreByName('  ')).rejects.toThrow();
    await expect(stores.upsertStoreByName('X', { kind: 'cuántica' as never })).rejects.toThrow();
    expect((await stores.upsertStoreByName('Mercadona', { kind: 'fisica' })).kind).toBe('fisica');
  });

  it('listStores va por orden alfabético', async () => {
    await stores.upsertStoreByName('Zara');
    await stores.upsertStoreByName('Amazon');
    expect((await stores.listStores()).map((s) => s.name)).toEqual(['Amazon', 'Zara']);
  });
});
