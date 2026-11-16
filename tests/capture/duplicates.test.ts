import { describe, expect, it } from 'vitest';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { findDuplicate, mergeDuplicate } from '@/lib/capture/duplicates';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import type { AiProvider } from '@/lib/ai/provider';
import type { Item } from '@/lib/db/types';
import { makeItem } from '../screens/setup';

const compra = (id: string, title: string, over: Partial<Item> = {}) => makeItem({ id, type: 'compra', title, status: 'quiero', area: null, ...over });

describe('findDuplicate', () => {
  const existing = [compra('a', 'Casio MTP-B220BL-1AV'), compra('b', 'Leche de avena'), makeItem({ id: 't', type: 'tarea', title: 'Casio MTP-B220BL-1AV' })];

  it('mismo título aunque cambien mayúsculas, acentos o espacios', () => {
    expect(findDuplicate({ type: 'compra', title: 'casio  mtp-b220bl-1av' }, existing)?.id).toBe('a');
    expect(findDuplicate({ type: 'compra', title: 'Leché de Avena' }, existing)?.id).toBe('b');
  });

  it('un título que contiene al otro (con sustancia) también', () => {
    expect(findDuplicate({ type: 'compra', title: 'Casio MTP-B220BL' }, existing)?.id).toBe('a');
    expect(findDuplicate({ type: 'compra', title: 'Reloj Casio MTP-B220BL-1AV azul' }, existing)?.id).toBe('a');
  });

  it('palabras muy parecidas (mismo conjunto, otro orden) cuentan', () => {
    expect(findDuplicate({ type: 'compra', title: 'avena de leche' }, existing)?.id).toBe('b');
  });

  it('lo corto o distinto no es un duplicado', () => {
    expect(findDuplicate({ type: 'compra', title: 'Leche' }, existing)).toBeNull();
    expect(findDuplicate({ type: 'compra', title: 'Leche de almendras' }, existing)).toBeNull();
    expect(findDuplicate({ type: 'compra', title: 'Pan' }, [compra('p', 'Pan')])).toBeNull();
  });

  it('solo del mismo tipo', () => {
    expect(findDuplicate({ type: 'idea', title: 'Casio MTP-B220BL-1AV' }, existing)).toBeNull();
  });

  it('un regalo solo se compara con los de la misma persona', () => {
    const gifts = [makeItem({ id: 'g', type: 'regalo', title: 'Caja para relojes', personId: 'rosendo', area: null })];
    expect(findDuplicate({ type: 'regalo', title: 'Caja para relojes', personId: 'rosendo' }, gifts)?.id).toBe('g');
    expect(findDuplicate({ type: 'regalo', title: 'Caja para relojes', personId: 'aina' }, gifts)).toBeNull();
  });

  it('no cuenta lo cerrado, lo archivado ni lo borrado', () => {
    const closed = [
      compra('c', 'Casio MTP-B220BL-1AV', { status: 'comprado' }),
      compra('d', 'Casio MTP-B220BL-1AV', { archived: true }),
      compra('e', 'Casio MTP-B220BL-1AV', { deletedAt: '2026-11-01T00:00:00Z' }),
    ];
    expect(findDuplicate({ type: 'compra', title: 'Casio MTP-B220BL-1AV' }, closed)).toBeNull();
  });

  it('no se compara consigo mismo', () => {
    expect(findDuplicate({ type: 'compra', title: 'Leche de avena', id: 'b' }, existing)).toBeNull();
  });
});

describe('captureText avisa de un posible duplicado y guarda igual', () => {
  const ai = (items: unknown[]): AiProvider => ({
    async generateJson(_p, schema) {
      return schema.parse({ items });
    },
    async generateText() {
      throw new Error('x');
    },
  });
  const setup = (a: AiProvider) => {
    const db = createMemoryBackend();
    const deps: CaptureDeps = { ai: a, items: createItemsRepo(db), people: createPeopleRepo(db), calendar: async () => { throw new Error('no'); }, now: new Date('2026-11-16T09:00:00Z') };
    return { db, deps };
  };

  it('"Ya tienes Casio MTP-B220BL en Compras": se guarda el nuevo y se indica cuál existía', async () => {
    const { deps } = setup(ai([{ kind: 'compra', title: 'Casio MTP-B220BL', confidence: 0.9 }]));
    const first = await deps.items.createItem({ type: 'compra', title: 'Casio MTP-B220BL-1AV' });
    const res = await captureText({ text: 'casio mtp-b220bl', origin: 'web' }, deps);
    expect(res.items).toHaveLength(1);
    expect(res.duplicates).toEqual([{ itemId: res.items[0].id, existingId: first.id }]);
    expect(await deps.items.listItems({ type: 'compra' })).toHaveLength(2);
  });

  it('sin parecidos no hay aviso', async () => {
    const { deps } = setup(ai([{ kind: 'compra', title: 'Leche', confidence: 0.9 }]));
    expect((await captureText({ text: 'comprar leche', origin: 'web' }, deps)).duplicates).toBeUndefined();
  });

  it('los items de una misma captura no se avisan entre sí', async () => {
    const { deps } = setup(ai([{ kind: 'compra', title: 'Pilas AAA', confidence: 0.9 }, { kind: 'compra', title: 'Pilas AAA', confidence: 0.9 }]));
    const res = await captureText({ text: 'pilas AAA y pilas AAA', origin: 'web' }, deps);
    expect(res.items).toHaveLength(2);
  });
});

describe('mergeDuplicate', () => {
  it('lo nuevo se suma a lo que ya había (notas, precio, tags, tienda) y el repetido va a la papelera', async () => {
    const db = createMemoryBackend();
    const items = createItemsRepo(db);
    const old = await items.createItem({ type: 'compra', title: 'Casio MTP-B220BL-1AV', notes: 'Azul', tags: ['reloj'] });
    const dup = await items.createItem({ type: 'compra', title: 'casio mtp-b220bl', notes: 'Con correa de acero', tags: ['regalo', 'reloj'], storeId: null, data: { price: 25 } });
    const merged = await mergeDuplicate(items, dup.id, old.id);
    expect(merged).toMatchObject({ id: old.id, notes: 'Azul\nCon correa de acero', tags: ['reloj', 'regalo'], data: { price: 25, quantity: 1, currency: 'EUR' } });
    expect((await items.listItems()).map((i) => i.id)).toEqual([old.id]);
    expect((await items.listDeleted(30)).map((i) => i.id)).toEqual([dup.id]);
  });

  it('lo que el existente ya tenía no se pisa', async () => {
    const items = createItemsRepo(createMemoryBackend());
    const old = await items.createItem({ type: 'compra', title: 'Reloj', data: { price: 20 } });
    const dup = await items.createItem({ type: 'compra', title: 'Reloj', data: { price: 99 } });
    expect((await mergeDuplicate(items, dup.id, old.id)).data).toMatchObject({ price: 20 });
  });
});
