/**
 * Regla de la fase 1: ningún item llega a la base de datos sin pasar la validación Zod del
 * registro de tipos (lib/items/itemTypes.ts). Los CHECK de type y status se quitaron en 0011,
 * así que esta es la única barrera: estos tests la fijan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbBackend } from '@/lib/db/backend';
import { createItemsRepo, type ItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';

let memory: ReturnType<typeof createMemoryBackend>;
let writes: string[];
let items: ItemsRepo;
let now: Date;

/** Un backend que apunta cada escritura en `items`, para comprobar que lo inválido ni lo intenta. */
function spy(inner: DbBackend): DbBackend {
  return {
    select: (t, w) => inner.select(t, w),
    remove: (t, w) => inner.remove(t, w),
    async insert(t, row) {
      if (t === 'items') writes.push('insert');
      return inner.insert(t, row);
    },
    async update(t, id, patch) {
      if (t === 'items') writes.push('update');
      return inner.update(t, id, patch);
    },
  };
}

beforeEach(() => {
  now = new Date('2026-11-16T10:00:00Z');
  memory = createMemoryBackend({ now: () => now });
  writes = [];
  items = createItemsRepo(spy(memory), { now: () => now });
});

describe('createItem valida con el registro', () => {
  it('rechaza un tipo que no existe y no escribe', async () => {
    await expect(items.createItem({ type: 'viaje' as never, title: 'X' })).rejects.toThrow(/tipo/i);
    expect(writes).toEqual([]);
  });

  it('rechaza un estado que no es del tipo y no escribe', async () => {
    await expect(items.createItem({ type: 'compra', title: 'X', status: 'hecho' })).rejects.toThrow(/estado/i);
    await expect(items.createItem({ type: 'tarea', title: 'X', status: 'comprado' })).rejects.toThrow(/estado/i);
    expect(writes).toEqual([]);
  });

  it('rechaza campos propios inválidos y no escribe', async () => {
    await expect(items.createItem({ type: 'compra', title: 'X', data: { price: -3 } })).rejects.toThrow();
    await expect(items.createItem({ type: 'idea', title: 'X', data: { potential: 9 } })).rejects.toThrow();
    await expect(items.createItem({ type: 'nota', title: 'X', data: { cualquier: 'cosa' } })).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it('guarda los campos propios normalizados (valores por defecto aplicados)', async () => {
    const item = await items.createItem({ type: 'compra', title: 'Casio', data: { price: 25 } });
    expect(item.data).toEqual({ price: 25, quantity: 1, currency: 'EUR' });
    expect(item.status).toBe('quiero');
  });

  it('un item nuevo empieza en el estado inicial de su tipo', async () => {
    expect((await items.createItem({ type: 'idea', title: 'a' })).status).toBe('semilla');
    expect((await items.createItem({ type: 'regalo', title: 'b' })).status).toBe('idea');
    expect((await items.createItem({ type: 'enlace', title: 'c' })).status).toBe('por_ver');
    expect((await items.createItem({ type: 'tarea', title: 'd' })).status).toBe('pendiente');
  });
});

describe('updateItem valida contra el item guardado', () => {
  it('rechaza un estado que no es del tipo del item', async () => {
    const compra = await items.createItem({ type: 'compra', title: 'Leche' });
    writes = [];
    await expect(items.updateItem(compra.id, { status: 'hecha' })).rejects.toThrow(/estado/i);
    expect(writes).toEqual([]);
    expect((await items.updateItem(compra.id, { status: 'en_carrito' })).status).toBe('en_carrito');
  });

  it('rechaza campos propios inválidos para el tipo guardado', async () => {
    const idea = await items.createItem({ type: 'idea', title: 'Blog' });
    writes = [];
    await expect(items.updateItem(idea.id, { data: { quantity: 2 } })).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it('al cambiar de tipo, el estado y los campos propios que ya no valen se reinician', async () => {
    const compra = await items.createItem({ type: 'compra', title: 'Reloj', status: 'en_carrito', data: { price: 20 } });
    const regalo = await items.updateItem(compra.id, { type: 'regalo' });
    expect(regalo.type).toBe('regalo');
    expect(regalo.status).toBe('idea');
    expect(regalo.data).toEqual({});
  });

  it('un parche que no toca tipo, estado ni campos propios no hace lecturas de más ni falla', async () => {
    const t = await items.createItem({ type: 'tarea', title: 'x' });
    expect((await items.updateItem(t.id, { title: 'y' })).title).toBe('y');
  });
});

describe('completedAt sigue al estado', () => {
  it('se pone al entrar en un estado que cierra y se quita al salir', async () => {
    const t = await items.createItem({ type: 'tarea', title: 'x' });
    expect(t.completedAt).toBeNull();
    const done = await items.updateItem(t.id, { status: 'hecha' });
    expect(done.completedAt).toBe(now.toISOString());
    now = new Date('2026-11-17T10:00:00Z');
    const again = await items.updateItem(t.id, { status: 'hecha' });
    expect(again.completedAt).toBe('2026-11-16T10:00:00.000Z');
    const open = await items.updateItem(t.id, { status: 'pendiente' });
    expect(open.completedAt).toBeNull();
  });
});

describe('ninguna otra parte del código escribe en items', () => {
  const root = path.join(__dirname, '../..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

  it("solo lib/db/items.ts hace insert/update/delete sobre la tabla 'items'", () => {
    const offenders = ['lib', 'app', 'components', 'scripts']
      .flatMap((d) => files(path.join(root, d)))
      .filter((f) => !f.endsWith(path.join('lib', 'db', 'items.ts')))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return (
          /backend\.(insert|update|remove)\(\s*'items'/.test(src) ||
          /from\(\s*'items'\s*\)\s*\.(insert|update|upsert|delete)\(/.test(src)
        );
      })
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });
});

describe('filas anteriores a la fase 1 se leen con el estado nuevo', () => {
  it('hecho, archivado y reading_state se traducen al leer', async () => {
    await memory.insert('items', { type: 'compra', title: 'a', status: 'hecho' });
    await memory.insert('items', { type: 'compra', title: 'b', status: 'archivado' });
    await memory.insert('items', { type: 'libro', title: 'c', status: 'pendiente', reading_state: 'leyendo' });
    const byTitle = Object.fromEntries((await items.listItems()).map((i) => [i.title, i]));
    expect(byTitle.a).toMatchObject({ status: 'comprado', archived: false });
    expect(byTitle.b).toMatchObject({ status: 'quiero', archived: true });
    expect(byTitle.c).toMatchObject({ status: 'leyendo', readingState: 'leyendo', archived: false });
  });

  it('listItems({ open: true }) deja fuera lo cerrado y lo archivado, también en filas antiguas', async () => {
    await memory.insert('items', { type: 'tarea', title: 'abierta', status: 'pendiente' });
    await memory.insert('items', { type: 'tarea', title: 'hecha antigua', status: 'hecho' });
    await memory.insert('items', { type: 'tarea', title: 'archivada antigua', status: 'archivado' });
    await items.createItem({ type: 'compra', title: 'nueva abierta' });
    const comprada = await items.createItem({ type: 'compra', title: 'comprada' });
    await items.updateItem(comprada.id, { status: 'comprado' });
    const open = await items.listItems({ open: true });
    expect(open.map((i) => i.title).sort()).toEqual(['abierta', 'nueva abierta']);
  });
});

describe('createItem con id y fecha propios (importar y migrar)', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('usa el id y la fecha de creación que se le dan', async () => {
    const item = await items.createItem({ type: 'compra', title: 'Masaje de cabeza' }, { id, createdAt: '2026-09-01T10:00:00.000Z' });
    expect(item.id).toBe(id);
    expect(item.createdAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('es idempotente: con un id que ya existe devuelve el item sin escribir otro', async () => {
    await items.createItem({ type: 'compra', title: 'A' }, { id });
    writes = [];
    const again = await items.createItem({ type: 'compra', title: 'B (otro intento)' }, { id });
    expect(again.title).toBe('A');
    expect(writes).toEqual([]);
    expect(await items.listItems()).toHaveLength(1);
  });

  it('también valida con el registro', async () => {
    await expect(items.createItem({ type: 'compra', title: 'X', status: 'hecha' }, { id })).rejects.toThrow(/estado/i);
    expect(writes).toEqual([]);
  });
});

describe('sugerencia de la Bandeja', () => {
  it('se guarda con el item y por defecto no hay', async () => {
    const plain = await items.createItem({ type: 'idea', title: 'x' });
    expect(plain.suggestion).toBeNull();
    const doubtful = await items.createItem({
      type: 'idea',
      title: 'Trabajar',
      needsReview: true,
      suggestion: { type: 'tarea', confidence: 0.3 },
    });
    expect(doubtful.suggestion).toEqual({ type: 'tarea', confidence: 0.3 });
    expect(memory.tables.items[0]).not.toHaveProperty('suggestion');
  });

  it('una sugerencia de un tipo que no existe se rechaza', async () => {
    await expect(items.createItem({ type: 'idea', title: 'x', suggestion: { type: 'viaje' as never, confidence: 0.5 } })).rejects.toThrow();
  });

  it('se puede quitar al aceptar la clasificación', async () => {
    const i = await items.createItem({ type: 'idea', title: 'x', suggestion: { type: 'tarea', confidence: 0.3 } });
    expect((await items.updateItem(i.id, { suggestion: null })).suggestion).toBeNull();
  });
});
