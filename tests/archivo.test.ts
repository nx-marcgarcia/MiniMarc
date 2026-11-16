import { describe, expect, it } from 'vitest';
import * as actions from '@/lib/actions/items';
import { groupArchivo } from '@/lib/archivo';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { makeItem } from './screens/setup';

describe('groupArchivo', () => {
  it('agrupa por mes de completedAt en Madrid, lo más reciente primero', () => {
    const groups = groupArchivo([
      makeItem({ id: 'oct', status: 'hecha', completedAt: '2026-10-15T10:00:00.000Z' }),
      // 31 oct 23:30 UTC = 1 nov 00:30 en Madrid.
      makeItem({ id: 'nov', status: 'hecha', completedAt: '2026-10-31T23:30:00.000Z' }),
    ]);
    expect(groups.map((g) => g.header)).toEqual(['Noviembre de 2026', 'Octubre de 2026']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['nov']);
  });

  it('sin completedAt usa updatedAt (un archivado)', () => {
    const groups = groupArchivo([makeItem({ id: 'a', archived: true, completedAt: null, updatedAt: '2026-09-02T10:00:00.000Z' })]);
    expect(groups[0].header).toBe('Septiembre de 2026');
  });
});

describe('listArchivo', () => {
  it('trae lo terminado o archivado, no lo abierto ni lo borrado, lo último primero', async () => {
    let now = new Date('2026-11-01T10:00:00Z');
    const backend = createMemoryBackend({ now: () => now });
    const deps = { items: createItemsRepo(backend, { now: () => now }), people: createPeopleRepo(backend) };
    const open = await deps.items.createItem({ type: 'tarea', title: 'Abierta' });
    const done = await deps.items.createItem({ type: 'tarea', title: 'Hecha' });
    await deps.items.updateItem(done.id, { status: 'hecha' });
    now = new Date('2026-11-05T10:00:00Z');
    const bought = await deps.items.createItem({ type: 'compra', title: 'Comprada' });
    await deps.items.updateItem(bought.id, { status: 'comprado' });
    const gone = await deps.items.createItem({ type: 'tarea', title: 'Borrada' });
    await deps.items.updateItem(gone.id, { status: 'hecha' });
    await deps.items.softDeleteItem(gone.id);
    const list = await actions.listArchivo(deps);
    expect(list.map((i) => i.title)).toEqual(['Comprada', 'Hecha']);
    expect(list.some((i) => i.id === open.id)).toBe(false);
  });
});
