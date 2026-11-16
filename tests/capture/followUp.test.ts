import { beforeEach, describe, expect, it } from 'vitest';
import type { CalendarGateway } from '@/lib/calendar/client';
import { correctCaptured, undoCaptured, type FollowUpDeps } from '@/lib/capture/followUp';
import { createCaptureLogRepo } from '@/lib/db/captureLog';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createStoresRepo } from '@/lib/db/stores';

let db: ReturnType<typeof createMemoryBackend>;
let deps: FollowUpDeps;
let deleted: [string, string][];

beforeEach(() => {
  db = createMemoryBackend();
  deleted = [];
  const gw = {
    deleteEvent: async (calendarId: string, eventId: string) => {
      if (eventId === 'roto') throw new Error('calendar down');
      deleted.push([calendarId, eventId]);
    },
  } as unknown as CalendarGateway;
  deps = {
    items: createItemsRepo(db),
    people: createPeopleRepo(db),
    stores: createStoresRepo(db),
    log: createCaptureLogRepo(db),
    calendar: async () => gw,
  };
});

async function captured(over: Record<string, unknown> = {}) {
  const item = await deps.items.createItem({
    type: 'idea',
    title: 'Trabajar',
    needsReview: true,
    suggestion: { type: 'tarea', confidence: 0.3 },
    ...over,
  });
  const logId = (await deps.log!.record({ rawInput: 'Trabajar', source: 'web', modelOutput: [], itemIds: [item.id] }))!;
  return { item, logId };
}

describe('correctCaptured (los chips del toast)', () => {
  it('cambiar el tipo: queda clasificado, sin sugerencia, con el estado inicial del nuevo tipo', async () => {
    const { item, logId } = await captured();
    const fixed = await correctCaptured(deps, { logId, itemId: item.id, patch: { type: 'tarea' } });
    expect(fixed).toMatchObject({ type: 'tarea', status: 'pendiente', area: 'personal', needsReview: false, suggestion: null });
  });

  it('cada corrección queda en el registro, para mejorar el prompt', async () => {
    const { item, logId } = await captured();
    await correctCaptured(deps, { logId, itemId: item.id, patch: { type: 'tarea' } });
    const [entry] = await deps.log!.list();
    expect(entry.corrections).toEqual([expect.objectContaining({ itemId: item.id, field: 'type', from: 'idea', to: 'tarea' })]);
  });

  it('cambiar la persona de un regalo, por id o con un nombre nuevo', async () => {
    const aina = await deps.people.upsertPersonByName('Aina');
    const { item, logId } = await captured({ type: 'regalo', title: 'Libro', needsReview: false, suggestion: null });
    expect((await correctCaptured(deps, { logId, itemId: item.id, patch: { personId: aina.id } })).personId).toBe(aina.id);
    const rosendo = await correctCaptured(deps, { logId, itemId: item.id, patch: { personName: 'Rosendo' } });
    expect(rosendo.personId).not.toBe(aina.id);
    expect((await deps.people.listPeople()).map((p) => p.name).sort()).toEqual(['Aina', 'Rosendo']);
    expect((await deps.log!.list())[0].corrections.map((c) => c.field)).toEqual(['personId', 'personId']);
  });

  it('cambiar la tienda de una compra, por id o con un nombre', async () => {
    const casio = await deps.stores.upsertStoreByName('Casio');
    const { item, logId } = await captured({ type: 'compra', title: 'Reloj', needsReview: false, suggestion: null });
    expect((await correctCaptured(deps, { logId, itemId: item.id, patch: { storeId: casio.id } })).storeId).toBe(casio.id);
    const other = await correctCaptured(deps, { logId, itemId: item.id, patch: { storeName: 'Amazon' } });
    expect(other.storeId).not.toBe(casio.id);
    expect((await deps.stores.listStores()).map((s) => s.name).sort()).toEqual(['Amazon', 'Casio']);
  });

  it('quitar la persona o la tienda', async () => {
    const aina = await deps.people.upsertPersonByName('Aina');
    const { item } = await captured({ type: 'regalo', personId: aina.id, needsReview: false, suggestion: null });
    expect((await correctCaptured(deps, { itemId: item.id, patch: { personId: null } })).personId).toBeNull();
  });

  it('sin cambios reales no escribe ni registra nada', async () => {
    const { item, logId } = await captured();
    const same = await correctCaptured(deps, { logId, itemId: item.id, patch: { type: 'idea' } });
    expect(same.id).toBe(item.id);
    expect((await deps.log!.list())[0].corrections).toEqual([]);
  });

  it('sin logId o sin registro, corrige igual', async () => {
    const { item } = await captured();
    expect((await correctCaptured({ ...deps, log: undefined }, { logId: 'x', itemId: item.id, patch: { type: 'compra' } })).type).toBe('compra');
  });

  it('si el registro falla, la corrección se hace igual', async () => {
    const { item } = await captured();
    const log = { record: async () => null, list: async () => [], addCorrection: async () => { throw new Error('db'); } };
    expect((await correctCaptured({ ...deps, log }, { logId: 'x', itemId: item.id, patch: { type: 'compra' } })).type).toBe('compra');
  });

  it('un item que ya no existe lanza', async () => {
    await expect(correctCaptured(deps, { itemId: 'nope', patch: { type: 'compra' } })).rejects.toThrow();
  });
});

describe('undoCaptured (Deshacer)', () => {
  it('manda a la papelera lo que creó la captura (recuperable 30 días)', async () => {
    const a = await deps.items.createItem({ type: 'compra', title: 'A' });
    const b = await deps.items.createItem({ type: 'compra', title: 'B' });
    const keep = await deps.items.createItem({ type: 'compra', title: 'Otro' });
    const r = await undoCaptured(deps, { itemIds: [a.id, b.id], eventIds: [] });
    expect(r).toEqual({ deleted: 2, eventsFailed: 0 });
    expect((await deps.items.listItems()).map((i) => i.id)).toEqual([keep.id]);
    expect((await deps.items.listDeleted(30)).map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('borra de Calendar las citas que creó', async () => {
    const r = await undoCaptured(deps, { itemIds: [], eventIds: ['e1', 'e2'] });
    expect(deleted).toEqual([['primary', 'e1'], ['primary', 'e2']]);
    expect(r).toEqual({ deleted: 0, eventsFailed: 0 });
  });

  it('si Calendar falla con una cita, lo dice y sigue con lo demás', async () => {
    const a = await deps.items.createItem({ type: 'compra', title: 'A' });
    const r = await undoCaptured(deps, { itemIds: [a.id], eventIds: ['roto', 'e2'] });
    expect(r).toEqual({ deleted: 1, eventsFailed: 1 });
    expect(deleted).toEqual([['primary', 'e2']]);
  });

  it('un item que ya no está no impide el resto', async () => {
    const a = await deps.items.createItem({ type: 'compra', title: 'A' });
    const r = await undoCaptured(deps, { itemIds: ['nope', a.id], eventIds: [] });
    expect(r.deleted).toBe(1);
  });
});
