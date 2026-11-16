import { describe, expect, it } from 'vitest';
import type { CaptureDeps, CaptureResult } from '@/lib/capture/pipeline';
import { captureFromWeb, quickCapture } from '@/lib/capture/web';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createStoresRepo } from '@/lib/db/stores';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function setup() {
  const db = createMemoryBackend();
  const stores = createStoresRepo(db);
  const people = createPeopleRepo(db);
  const items = createItemsRepo(db);
  const aliexpress = await stores.upsertStoreByName('Aliexpress');
  const a = await items.createItem({ type: 'compra', title: 'Masaje de cabeza', storeId: aliexpress.id });
  const b = await items.createItem({ type: 'compra', title: 'Cajón organizador', storeId: aliexpress.id });
  const deps: CaptureDeps = { ai: {} as never, items, people, stores, calendar: async () => ({}) as never, now: new Date('2026-11-16T09:00:00Z') };
  const result: CaptureResult = { items: [a, b], eventIds: ['e1'], logId: 'log-1', duplicates: [{ itemId: b.id, existingId: 'old' }] };
  return { deps, result, ids: [a.id, b.id] };
}

describe('captureFromWeb devuelve lo que ha entendido', () => {
  it('líneas, items para los chips, citas creadas, id del registro y duplicados', async () => {
    const { deps, result, ids } = await setup();
    const r = await captureFromWeb(form({ text: 'Aliexpress: masaje, cajón' }), { captureDeps: async () => deps, capture: async () => result });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.message).toBe('Guardado en Compras y Calendar');
    expect(r.value.understood).toMatchObject({
      lines: ['2 compras en Aliexpress', '1 cita en Calendar'],
      eventIds: ['e1'],
      logId: 'log-1',
    });
    expect(r.value.understood?.items.map((i) => [i.id, i.storeName, i.duplicateOf])).toEqual([
      [ids[0], 'Aliexpress', undefined],
      [ids[1], 'Aliexpress', 'old'],
    ]);
  });

  it('quickCapture en Auto lo trae también, con el enlace a lo recién añadido', async () => {
    const { deps, result } = await setup();
    const r = await quickCapture(form({ text: 'x', kind: 'auto' }), { captureDeps: async () => deps, capture: async () => result });
    expect(r.ok && r.value.understood?.lines[0]).toBe('2 compras en Aliexpress');
    expect(r.ok && r.value.href).toBe('/bandeja');
  });

  it('si no se pueden leer los nombres, la captura sigue y solo falta la explicación', async () => {
    const { deps, result } = await setup();
    const broken = { ...deps, people: { ...deps.people, listPeople: async () => { throw new Error('db'); } } };
    const r = await captureFromWeb(form({ text: 'x' }), { captureDeps: async () => broken, capture: async () => result });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.message).toBe('Guardado en Compras y Calendar');
    expect(r.ok && r.value.understood).toBeUndefined();
  });

  it('un chip de tipo (sin IA) no trae explicación: se guarda lo que se eligió', async () => {
    const { deps } = await setup();
    const r = await quickCapture(form({ text: 'pilas', kind: 'compra' }), { captureDeps: async () => deps });
    expect(r.ok && r.value.understood).toBeUndefined();
  });
});
