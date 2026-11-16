import { describe, expect, it } from 'vitest';
import { createItemsRepo, rowToItem } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';

function setup() {
  let t = new Date('2026-10-01T10:00:00.000Z');
  const clock = () => t;
  const backend = createMemoryBackend({ now: clock });
  return { items: createItemsRepo(backend, { now: clock }), advance: (days: number) => (t = new Date(t.getTime() + days * 86_400_000)) };
}

describe('updatedAt: cuándo se tocó el contenido', () => {
  it('un item nuevo empieza con updatedAt igual a su creación', async () => {
    const { items } = setup();
    const item = await items.createItem({ type: 'idea', title: 'App de recetas' });
    expect(item.updatedAt).toBe(item.createdAt);
  });

  it('cambiar el título, el estado, las notas, la fecha o los datos lo mueve', async () => {
    const { items, advance } = setup();
    const item = await items.createItem({ type: 'idea', title: 'App de recetas' });
    advance(40);
    const after = await items.updateItem(item.id, { status: 'explorando' });
    expect(after.updatedAt).toBe('2026-11-10T10:00:00.000Z');
    advance(1);
    expect((await items.updateItem(item.id, { title: 'App de cocina' })).updatedAt).toBe('2026-11-11T10:00:00.000Z');
    advance(1);
    expect((await items.updateItem(item.id, { data: { category: 'app' } })).updatedAt).toBe('2026-11-12T10:00:00.000Z');
  });

  it('lo técnico (calendario, vista previa, posponer) no lo mueve', async () => {
    const { items, advance } = setup();
    const item = await items.createItem({ type: 'tarea', title: 'Llamar', dueAt: '2026-10-05T08:00:00.000Z', hasTime: true });
    advance(30);
    const after = await items.updateItem(item.id, { calendarEventId: 'ev1', syncError: null, linkTitle: 'x', snoozedUntil: '2026-11-07T00:00:00.000Z', snoozeCount: 1 });
    expect(after.updatedAt).toBe(item.createdAt);
    expect(after).toMatchObject({ snoozedUntil: '2026-11-07T00:00:00.000Z', snoozeCount: 1 });
  });
});

describe('rowToItem con filas anteriores a 0013', () => {
  const row = { id: 'a', type: 'tarea', title: 'x', status: 'pendiente', created_at: '2026-09-01T10:00:00.000Z' };

  it('sin updated_at usa created_at; sin snooze, nada pospuesto', () => {
    expect(rowToItem(row)).toMatchObject({ updatedAt: '2026-09-01T10:00:00.000Z', snoozedUntil: null, snoozeCount: 0 });
  });

  it('con las columnas de 0013 las lee', () => {
    expect(rowToItem({ ...row, updated_at: '2026-10-01T10:00:00.000Z', snoozed_until: '2026-10-08T00:00:00.000Z', snooze_count: 2 })).toMatchObject({
      updatedAt: '2026-10-01T10:00:00.000Z',
      snoozedUntil: '2026-10-08T00:00:00.000Z',
      snoozeCount: 2,
    });
  });
});
