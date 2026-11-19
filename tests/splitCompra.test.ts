import { describe, expect, it } from 'vitest';
import { UserError } from '@/lib/actions/result';
import type { AiProvider } from '@/lib/ai/provider';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createStoresRepo } from '@/lib/db/stores';
import { applySplit, suggestSplit, type SplitDeps } from '@/lib/splitCompra';

function setup(answer: unknown | Error = { store: null, products: [] }) {
  const db = createMemoryBackend();
  const prompts: string[] = [];
  const ai = {
    async generateJson<T>(prompt: string, schema: { parse: (v: unknown) => T }) {
      prompts.push(prompt);
      if (answer instanceof Error) throw answer;
      return schema.parse(answer);
    },
    async generateText() {
      throw new Error('no se usa');
    },
  } as AiProvider;
  const deps: SplitDeps = { ai, items: createItemsRepo(db), stores: createStoresRepo(db) };
  return { deps, prompts };
}

const aliexpress = (deps: SplitDeps, over = {}) =>
  deps.items.createItem({ type: 'compra', title: 'Aliexpress', notes: 'funda móvil, cable USB-C y un soporte', status: 'quiero', data: {}, ...over });

const TWO = [{ title: 'Funda móvil' }, { title: 'Cable USB-C', price: 4.5, link: 'https://es.aliexpress.com/item/1.html' }];
const input = (over = {}) => ({ store: { name: 'Aliexpress', domain: 'aliexpress.com' }, products: [{ title: 'Funda móvil', price: null, link: null, notes: null }, { title: 'Cable USB-C', price: 4.5, link: null, notes: null }], ...over });

describe('suggestSplit', () => {
  it('manda a la IA el título y las notas, y devuelve la tienda y los productos sin guardar nada', async () => {
    const { deps, prompts } = setup({ store: { name: 'Aliexpress', domain: 'aliexpress.com' }, products: TWO });
    const item = await aliexpress(deps);
    const proposal = await suggestSplit(deps, item.id);
    expect(prompts[0]).toContain('funda móvil, cable USB-C y un soporte');
    expect(proposal.store).toEqual({ name: 'Aliexpress', domain: 'aliexpress.com' });
    expect(proposal.products).toEqual([
      { title: 'Funda móvil', price: null, link: null, notes: null },
      { title: 'Cable USB-C', price: 4.5, link: 'https://es.aliexpress.com/item/1.html', notes: null },
    ]);
    expect(await deps.items.listItems({ type: 'compra' })).toHaveLength(1);
    expect(await deps.stores.listStores()).toEqual([]);
  });

  it('una compra de Trabajo no se envía a la IA', async () => {
    const { deps, prompts } = setup();
    const item = await aliexpress(deps, { area: 'trabajo' });
    await expect(suggestSplit(deps, item.id)).rejects.toThrow(UserError);
    expect(prompts).toEqual([]);
  });

  it('descarta productos sin nombre o con un enlace que no es http', async () => {
    const { deps } = setup({ store: null, products: [{ title: '  ' }, { title: 'Soporte', link: 'javascript:alert(1)' }, { title: 'Funda' }] });
    const item = await aliexpress(deps);
    expect((await suggestSplit(deps, item.id)).products.map((p) => p.title)).toEqual(['Funda']);
  });

  it('si la IA falla, lo dice en español', async () => {
    const { deps } = setup(new Error('cuota'));
    const item = await aliexpress(deps);
    await expect(suggestSplit(deps, item.id)).rejects.toThrow(/No he podido separarlo/);
  });

  it('una compra que no existe da un error para Marc', async () => {
    const { deps } = setup();
    await expect(suggestSplit(deps, 'nada')).rejects.toThrow('No encuentro esa compra.');
  });
});

describe('applySplit', () => {
  it('crea una compra por producto con la tienda, su precio y el estado del original, y archiva el original', async () => {
    const { deps } = setup();
    const item = await aliexpress(deps, { tags: ['casa'], projectId: null });
    const created = await applySplit(deps, item.id, input());
    expect(created.map((c) => c.title)).toEqual(['Funda móvil', 'Cable USB-C']);
    const [store] = await deps.stores.listStores();
    expect(store).toMatchObject({ name: 'Aliexpress', domain: 'aliexpress.com' });
    expect(created.every((c) => c.type === 'compra' && c.status === 'quiero' && c.storeId === store.id && c.tags[0] === 'casa')).toBe(true);
    expect(created[1].data).toMatchObject({ price: 4.5, currency: 'EUR' });
    expect(created[0].data.price).toBeUndefined();
    expect(created[0].sourceText).toBe('Aliexpress\nfunda móvil, cable USB-C y un soporte');
    const all = await deps.items.listItems({ type: 'compra' });
    expect(all.find((i) => i.id === item.id)?.archived).toBe(true);
    expect(all.filter((i) => !i.archived)).toHaveLength(2);
  });

  it('con la tienda ya existente no la duplica; sin tienda en la vista previa conserva la del original', async () => {
    const { deps } = setup();
    const casio = await deps.stores.upsertStoreByName('Casio');
    const a = await aliexpress(deps);
    await applySplit(deps, a.id, input({ store: { name: 'casio', domain: null } }));
    expect((await deps.stores.listStores()).map((s) => s.name)).toEqual(['Casio']);
    const b = await aliexpress(deps, { storeId: casio.id });
    const created = await applySplit(deps, b.id, input({ store: null }));
    expect(created.every((c) => c.storeId === casio.id)).toBe(true);
  });

  it('pide al menos dos productos con nombre y no toca nada si no los hay', async () => {
    const { deps } = setup();
    const item = await aliexpress(deps);
    await expect(applySplit(deps, item.id, input({ products: [{ title: 'Solo uno', price: null, link: null, notes: null }] }))).rejects.toThrow(/al menos dos/);
    await expect(applySplit(deps, item.id, input({ products: [{ title: '', price: null, link: null, notes: null }, { title: 'x', price: null, link: null, notes: null }] }))).rejects.toThrow(UserError);
    expect((await deps.items.listItems({ type: 'compra' })).filter((i) => !i.archived)).toHaveLength(1);
  });

  it('una compra ya archivada no se separa otra vez', async () => {
    const { deps } = setup();
    const item = await aliexpress(deps);
    await applySplit(deps, item.id, input());
    await expect(applySplit(deps, item.id, input())).rejects.toThrow('Esa compra ya está archivada.');
  });

  it('si falla a medias, lo creado va a la Papelera y el original sigue como estaba', async () => {
    const { deps } = setup();
    const item = await aliexpress(deps);
    let n = 0;
    const real = deps.items.createItem.bind(deps.items);
    deps.items.createItem = async (i, o) => {
      if (++n === 2) throw new Error('red');
      return real(i, o);
    };
    await expect(applySplit(deps, item.id, input())).rejects.toThrow(/No se ha cambiado nada/);
    const left = await deps.items.listItems({ type: 'compra' });
    expect(left.map((i) => i.id)).toEqual([item.id]);
    expect(left[0].archived).toBe(false);
  });
});
