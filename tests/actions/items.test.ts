import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createItemsRepo } from '@/lib/db/items';
import { createPeopleRepo } from '@/lib/db/people';
import * as actions from '@/lib/actions/items';
import type { ActionDeps } from '@/lib/actions/items';
import { attempt } from '@/lib/actions/result';

let deps: ActionDeps;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  const clock = () => new Date('2026-10-21T10:00:00Z');
  const backend = createMemoryBackend({ now: clock });
  deps = { items: createItemsRepo(backend, { now: clock }), people: createPeopleRepo(backend) };
});

describe('addItem', () => {
  it.each(['', '   \n\t'])('rechaza un título vacío (%j) y no guarda nada', async (title) => {
    await expect(actions.addItem(deps, form({ type: 'tarea', title }))).rejects.toThrow(/título/i);
    expect(await deps.items.listItems()).toEqual([]);
  });

  it('crea una tarea Personal por defecto, con fecha y hora de Madrid en UTC', async () => {
    const item = await actions.addItem(
      deps,
      form({ type: 'tarea', title: '  Llamar al seguro ', dueDate: '2026-10-22', dueTime: '09:30' }),
    );
    expect(item.title).toBe('Llamar al seguro');
    expect(item.area).toBe('personal');
    expect(item.dueAt).toBe('2026-10-22T07:30:00.000Z');
    expect(item.hasTime).toBe(true);
    expect(item.origin).toBe('web');
  });

  it('rechaza un tipo o un área desconocidos', async () => {
    await expect(actions.addItem(deps, form({ type: 'cita', title: 'X' }))).rejects.toThrow();
    await expect(actions.addItem(deps, form({ type: 'tarea', title: 'X', area: 'casa' }))).rejects.toThrow();
  });
});

describe('addItem: tienda de una compra', () => {
  it('una compra guarda la tienda elegida; otros tipos la ignoran', async () => {
    const compra = await actions.addItem(deps, form({ type: 'compra', title: 'Reloj', storeId: 's1' }));
    expect(compra.storeId).toBe('s1');
    const tarea = await actions.addItem(deps, form({ type: 'tarea', title: 'Llamar', storeId: 's1' }));
    expect(tarea.storeId).toBeNull();
  });
});

describe('deleteItem / undoDelete', () => {
  it('deleteItem seguido de undoDelete restaura el elemento', async () => {
    const item = await actions.addItem(deps, form({ type: 'compra', title: 'Leche' }));
    await actions.deleteItem(deps, item.id);
    expect(await actions.listByType(deps, 'compra')).toEqual([]);
    await actions.undoDelete(deps, item.id);
    const back = await actions.listByType(deps, 'compra');
    expect(back.map((i) => i.id)).toEqual([item.id]);
    expect(back[0].deletedAt).toBeNull();
  });
});

describe('/tareas', () => {
  it('la lista Personal y la de Trabajo son vistas separadas y no comparten elementos', async () => {
    await actions.addItem(deps, form({ type: 'tarea', title: 'Dentista', area: 'personal' }));
    await actions.addItem(deps, form({ type: 'tarea', title: 'Informe', area: 'trabajo' }));
    await actions.addItem(deps, form({ type: 'tarea', title: 'Reunión', area: 'trabajo' }));
    await actions.addItem(deps, form({ type: 'compra', title: 'Leche' }));

    const personal = await actions.listTareas(deps, 'personal');
    const trabajo = await actions.listTareas(deps, 'trabajo');
    expect(personal.map((i) => i.title)).toEqual(['Dentista']);
    expect(trabajo.map((i) => i.title).sort()).toEqual(['Informe', 'Reunión']);
    const shared = personal.filter((p) => trabajo.some((t) => t.id === p.id));
    expect(shared).toEqual([]);
    expect(trabajo.every((i) => i.area === 'trabajo')).toBe(true);
  });

  it('con Todo devuelve las de las dos áreas en el mismo orden', async () => {
    await actions.addItem(deps, form({ type: 'tarea', title: 'Dentista', area: 'personal', dueDate: '2026-10-23' }));
    await actions.addItem(deps, form({ type: 'tarea', title: 'Informe', area: 'trabajo', dueDate: '2026-10-22' }));
    const all = await actions.listTareas(deps, 'todo');
    expect(all.map((i) => i.title)).toEqual(['Informe', 'Dentista']);
  });

  it('la Bandeja con Todo lista las dos áreas', async () => {
    await deps.items.createItem({ type: 'tarea', title: 'A', area: 'personal', needsReview: true });
    await deps.items.createItem({ type: 'tarea', title: 'B', area: 'trabajo', needsReview: true });
    expect((await actions.listSinClasificar(deps, 'todo')).map((i) => i.title).sort()).toEqual(['A', 'B']);
    expect((await actions.listSinClasificar(deps, 'trabajo')).map((i) => i.title)).toEqual(['B']);
  });

  it('no muestra las tareas sin clasificar ni las hechas', async () => {
    const a = await actions.addItem(deps, form({ type: 'tarea', title: 'Hecha' }));
    await deps.items.createItem({ type: 'tarea', title: 'Dudosa', area: 'personal', needsReview: true });
    await actions.toggleDone(deps, a.id);
    expect(await actions.listTareas(deps, 'personal')).toEqual([]);
  });
});

describe('addItem de una tarea que se repite', () => {
  it('guarda la repetición en sus campos', async () => {
    const item = await actions.addItem(deps, form({ type: 'tarea', title: 'Regar', dueDate: '2026-10-22', recurrence: 'semanal' }));
    expect(item.data).toEqual({ recurrence: 'semanal' });
  });

  it('sin fecha no se puede repetir', async () => {
    await expect(actions.addItem(deps, form({ type: 'tarea', title: 'Regar', recurrence: 'semanal' }))).rejects.toThrow(/necesita fecha/);
  });
});

describe('toggleDone', () => {
  it('alterna entre pendiente y hecha', async () => {
    const item = await actions.addItem(deps, form({ type: 'tarea', title: 'X' }));
    expect((await actions.toggleDone(deps, item.id)).status).toBe('hecha');
    expect((await actions.toggleDone(deps, item.id)).status).toBe('pendiente');
  });

  it('lanza si el elemento no existe', async () => {
    await expect(actions.toggleDone(deps, 'nope')).rejects.toThrow();
  });
});

describe('toggleDone de una tarea que se repite', () => {
  // El reloj de los tests es el 2026-10-21 10:00 UTC.
  const repeating = (dueDate: string, recurrence: string, dueTime = '09:30') =>
    deps.items.createItem({
      type: 'tarea',
      title: 'Regar las plantas',
      area: 'personal',
      ...(dueTime ? { dueAt: new Date(`${dueDate}T${dueTime}:00+02:00`).toISOString(), hasTime: true } : {}),
      data: { recurrence },
    });

  it('no se cierra: sigue pendiente y pasa a su siguiente fecha', async () => {
    const item = await repeating('2026-10-21', 'semanal');
    const done = await actions.toggleDone(deps, item.id, new Date('2026-10-21T10:00:00Z'));
    expect(done.status).toBe('pendiente');
    expect(done.completedAt).toBeNull();
    // 09:30 en Madrid: el 25 de octubre cambia la hora, y la tarea sigue a las 09:30 locales.
    expect(done.dueAt).toBe('2026-10-28T08:30:00.000Z');
    expect(done.data.recurrence).toBe('semanal');
  });

  it('si se completa antes de tiempo, la siguiente cuenta desde su fecha, no desde hoy', async () => {
    const item = await repeating('2026-10-22', 'semanal');
    const done = await actions.toggleDone(deps, item.id, new Date('2026-10-21T10:00:00Z'));
    expect(done.dueAt).toBe('2026-10-29T08:30:00.000Z');
  });

  it('si va con retraso, la siguiente es la primera que queda por delante', async () => {
    const item = await repeating('2026-10-01', 'diaria');
    const done = await actions.toggleDone(deps, item.id, new Date('2026-10-21T10:00:00Z'));
    expect(done.dueAt).toBe('2026-10-22T07:30:00.000Z');
  });

  it('una repetición sin fecha no tiene de dónde contar: se completa como cualquier tarea', async () => {
    const item = await deps.items.createItem({ type: 'tarea', title: 'Sin fecha', area: 'personal', data: { recurrence: 'diaria' } });
    expect((await actions.toggleDone(deps, item.id)).status).toBe('hecha');
  });

  it('una tarea que ya estaba hecha se reabre (no se avanza)', async () => {
    const item = await repeating('2026-10-21', 'diaria');
    await deps.items.updateItem(item.id, { status: 'hecha' });
    const reopened = await actions.toggleDone(deps, item.id, new Date('2026-10-21T10:00:00Z'));
    expect(reopened.status).toBe('pendiente');
    expect(reopened.dueAt).toBe(item.dueAt);
  });
});

describe('moveItem', () => {
  it('saca un elemento de Sin clasificar a otra lista', async () => {
    const raw = await deps.items.createItem({ type: 'idea', title: 'Comprar pilas', needsReview: true });
    expect((await actions.listSinClasificar(deps)).map((i) => i.id)).toEqual([raw.id]);
    const moved = await actions.moveItem(deps, raw.id, { type: 'compra', needsReview: false });
    expect(moved.type).toBe('compra');
    expect(await actions.listSinClasificar(deps)).toEqual([]);
    expect((await actions.listByType(deps, 'compra')).map((i) => i.id)).toEqual([raw.id]);
  });

  it('una tarea movida sin área queda en Personal', async () => {
    const idea = await actions.addItem(deps, form({ type: 'idea', title: 'Viaje' }));
    const moved = await actions.moveItem(deps, idea.id, { type: 'tarea' });
    expect(moved.area).toBe('personal');
  });

  it('rechaza campos que no se pueden mover y títulos vacíos', async () => {
    const item = await actions.addItem(deps, form({ type: 'idea', title: 'Viaje' }));
    await expect(actions.moveItem(deps, item.id, { title: '  ' })).rejects.toThrow(/título/i);
    await expect(
      actions.moveItem(deps, item.id, { calendarEventId: 'x' } as never),
    ).rejects.toThrow();
  });
});

describe('sync hook (Tarea 7)', () => {
  it('se llama tras cada escritura y guarda eventId y error como calendarEventId y syncError', async () => {
    const sync = vi.fn(async () => ({ eventId: 'ev1', error: null }));
    const withSync = { ...deps, sync };
    const item = await actions.addItem(withSync, form({ type: 'tarea', title: 'Cita', dueDate: '2026-10-22', dueTime: '10:00' }));
    expect(item.calendarEventId).toBe('ev1');
    await actions.toggleDone(withSync, item.id);
    await actions.deleteItem(withSync, item.id);
    expect(sync).toHaveBeenCalledTimes(3);
    const deleted = sync.mock.calls[2] as unknown as [{ deletedAt: string | null }];
    expect(deleted[0].deletedAt).not.toBeNull();
  });

  it('un sync que lanza no hace fallar la acción: el elemento queda guardado con syncError', async () => {
    const sync = vi.fn(async () => {
      throw new Error('invalid_grant');
    });
    const withSync = { ...deps, sync };
    const item = await actions.addItem(withSync, form({ type: 'tarea', title: 'Cita', dueDate: '2026-10-22' }));
    expect(item.syncError).toBe(actions.SYNC_UNAVAILABLE);
    const stored = await deps.items.listItems();
    expect(stored.map((i) => [i.title, i.syncError])).toEqual([['Cita', actions.SYNC_UNAVAILABLE]]);

    const result = await attempt(() => actions.addItem(withSync, form({ type: 'tarea', title: 'Otra' })), 'fallo');
    expect(result.ok).toBe(true);
    expect(await deps.items.listItems()).toHaveLength(2);

    await expect(actions.toggleDone(withSync, item.id)).resolves.toMatchObject({ status: 'hecha' });
    await expect(actions.deleteItem(withSync, item.id)).resolves.toBeUndefined();
    await expect(actions.undoDelete(withSync, item.id)).resolves.toMatchObject({ id: item.id });
  });

  it('un error al guardar el resultado del sync tampoco hace fallar la acción', async () => {
    const withSync: ActionDeps = {
      ...deps,
      sync: async () => ({ eventId: 'ev1', error: null }),
      items: { ...deps.items, updateItem: async () => Promise.reject(new Error('red')) },
    };
    const item = await actions.addItem(withSync, form({ type: 'tarea', title: 'Cita' }));
    expect(item.title).toBe('Cita');
    expect(await deps.items.listItems()).toHaveLength(1);
  });
});

describe('cambio de tipo y fecha (M-4)', () => {
  it('una tarea que pasa a idea, compra o regalo pierde la fecha y la hora', async () => {
    for (const type of ['idea', 'compra', 'regalo'] as const) {
      const t = await actions.addItem(deps, form({ type: 'tarea', title: `T ${type}`, dueDate: '2026-10-22', dueTime: '10:00' }));
      const moved = await actions.moveItem(deps, t.id, { type });
      expect(moved).toMatchObject({ type, dueAt: null, hasTime: false });
    }
  });

  it('una fecha enviada junto a un tipo que no es tarea se descarta', async () => {
    const idea = await actions.addItem(deps, form({ type: 'idea', title: 'Viaje' }));
    const moved = await actions.moveItem(deps, idea.id, { type: 'compra', dueAt: '2026-10-22T08:00:00.000Z', hasTime: true });
    expect(moved).toMatchObject({ dueAt: null, hasTime: false });
  });

  it('una tarea que sigue siendo tarea conserva su fecha', async () => {
    const t = await actions.addItem(deps, form({ type: 'tarea', title: 'T', dueDate: '2026-10-22', dueTime: '10:00' }));
    const moved = await actions.moveItem(deps, t.id, { area: 'trabajo' });
    expect(moved).toMatchObject({ dueAt: '2026-10-22T08:00:00.000Z', hasTime: true });
  });

  it('una idea que pasa a tarea puede recibir fecha', async () => {
    const idea = await actions.addItem(deps, form({ type: 'idea', title: 'Viaje' }));
    const moved = await actions.moveItem(deps, idea.id, { type: 'tarea', dueAt: '2026-10-22T08:00:00.000Z', hasTime: true });
    expect(moved).toMatchObject({ type: 'tarea', dueAt: '2026-10-22T08:00:00.000Z', hasTime: true });
  });
});

describe('Sin clasificar por área (M-3)', () => {
  it('separa Personal y Trabajo; lo que no tiene área cuenta como Personal', async () => {
    await deps.items.createItem({ type: 'tarea', title: 'Informe', area: 'trabajo', needsReview: true });
    await deps.items.createItem({ type: 'idea', title: 'Idea de equipo', area: 'trabajo', needsReview: true });
    await deps.items.createItem({ type: 'tarea', title: 'Dentista', area: 'personal', needsReview: true });
    await deps.items.createItem({ type: 'compra', title: 'Pilas', needsReview: true });

    const personal = await actions.listSinClasificar(deps, 'personal');
    const trabajo = await actions.listSinClasificar(deps, 'trabajo');
    expect(personal.map((i) => i.title).sort()).toEqual(['Dentista', 'Pilas']);
    expect(trabajo.map((i) => i.title).sort()).toEqual(['Idea de equipo', 'Informe']);
    expect(personal.filter((p) => trabajo.some((t) => t.id === p.id))).toEqual([]);
    expect(await actions.listSinClasificar(deps)).toHaveLength(4);
  });
});

describe('regalos', () => {
  it('agrupa los regalos por persona y da de alta personas con cumpleaños', async () => {
    const ana = await actions.addPerson(deps, form({ name: 'Ana', birthday: '1990-11-02' }));
    expect(ana.birthday).toBe('1990-11-02');
    await actions.addItem(deps, form({ type: 'regalo', title: 'Libro', personId: ana.id }));
    await actions.addItem(deps, form({ type: 'regalo', title: 'Sin dueño' }));
    const groups = await actions.listRegalos(deps);
    expect(groups.people.map((g) => [g.person.name, g.items.map((i) => i.title)])).toEqual([['Ana', ['Libro']]]);
    expect(groups.unassigned.map((i) => i.title)).toEqual(['Sin dueño']);
  });

  it('cambia el cumpleaños de una persona y rechaza fechas inválidas', async () => {
    const ana = await actions.addPerson(deps, form({ name: 'Ana' }));
    const up = await actions.updatePerson(deps, ana.id, form({ name: 'Ana', birthday: '1990-11-02' }));
    expect(up.birthday).toBe('1990-11-02');
    await expect(actions.updatePerson(deps, ana.id, form({ name: 'Ana', birthday: '1990-13-40' }))).rejects.toThrow();
  });

  it('addPerson y updatePerson guardan la ficha: alias, relación, gustos, tallas y contacto', async () => {
    const rosendo = await actions.addPerson(
      deps,
      form({ name: 'Rosendo', alias: 'papá', relation: 'familia', likes: 'relojes', sizes: 'camiseta: L', email: 'r@example.com' }),
    );
    expect(rosendo).toMatchObject({
      alias: ['papá'],
      relation: 'familia',
      likes: 'relojes',
      sizes: { camiseta: 'L' },
      contact: { email: 'r@example.com' },
    });
    const up = await actions.updatePerson(deps, rosendo.id, form({ name: 'Rosendo', alias: '', likes: 'té', dislikes: 'perfume' }));
    expect(up).toMatchObject({ alias: [], likes: 'té', dislikes: 'perfume', relation: 'familia' });
  });
});

describe('Bandeja y Papelera (Tarea 11)', () => {
  it('listRecent: lo creado en las últimas 24 h, sin eliminados, separado en Personal y Trabajo, lo último primero', async () => {
    let now = new Date('2026-10-20T09:00:00Z');
    const backend = createMemoryBackend({ now: () => now });
    const d: ActionDeps = { items: createItemsRepo(backend, { now: () => now }), people: createPeopleRepo(backend) };
    await d.items.createItem({ type: 'idea', title: 'Hace 25 h' });
    now = new Date('2026-10-20T11:00:00Z');
    await d.items.createItem({ type: 'tarea', title: 'Informe', area: 'trabajo' });
    now = new Date('2026-10-21T08:00:00Z');
    await d.items.createItem({ type: 'compra', title: 'Leche' });
    now = new Date('2026-10-21T08:30:00Z');
    const done = await d.items.createItem({ type: 'tarea', title: 'Hecha', area: 'personal' });
    await d.items.updateItem(done.id, { status: 'hecha' });
    now = new Date('2026-10-21T09:00:00Z');
    await d.items.createItem({ type: 'idea', title: 'Idea de equipo', area: 'trabajo', needsReview: true });
    const gone = await d.items.createItem({ type: 'idea', title: 'Borrada' });
    await d.items.softDeleteItem(gone.id);

    const recent = await actions.listRecent(d, new Date('2026-10-21T10:00:00Z'));
    // Done items stay: the Bandeja is "what came in", whatever happened to it since.
    expect(recent.personal.map((i) => i.title)).toEqual(['Hecha', 'Leche']);
    expect(recent.trabajo.map((i) => i.title)).toEqual(['Idea de equipo', 'Informe']);
  });

  it('listPapelera: los eliminados de los últimos 30 días; restaurar los devuelve a su lista', async () => {
    const a = await actions.addItem(deps, form({ type: 'compra', title: 'Leche' }));
    await actions.deleteItem(deps, a.id);
    expect((await actions.listPapelera(deps)).map((i) => i.title)).toEqual(['Leche']);
    await actions.undoDelete(deps, a.id);
    expect(await actions.listPapelera(deps)).toEqual([]);
    expect((await actions.listByType(deps, 'compra')).map((i) => i.title)).toEqual(['Leche']);
  });
});

describe('libros', () => {
  it('addItem crea un libro con autor, enlace y estado', async () => {
    const book = await actions.addItem(
      deps,
      form({ type: 'libro', title: 'Sapiens', author: ' Harari ', link: ' https://example.com/sapiens ', readingState: 'leyendo' }),
    );
    expect(book).toMatchObject({
      type: 'libro',
      author: 'Harari',
      link: 'https://example.com/sapiens',
      readingState: 'leyendo',
      status: 'leyendo',
      area: null,
    });
  });

  it('rechaza un estado de lectura desconocido', async () => {
    await expect(actions.addItem(deps, form({ type: 'libro', title: 'X', readingState: 'abandonado' }))).rejects.toThrow();
  });

  it('listLibros devuelve los tres estados y no los archivados ni los de revisión', async () => {
    const a = await deps.items.createItem({ type: 'libro', title: 'A' });
    const b = await deps.items.createItem({ type: 'libro', title: 'B', readingState: 'leido' });
    const c = await deps.items.createItem({ type: 'libro', title: 'C' });
    await deps.items.createItem({ type: 'libro', title: 'D', needsReview: true });
    await actions.moveItem(deps, c.id, { archived: true });
    expect((await actions.listLibros(deps)).map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('toggleDone en un libro lo marca leído y al revés vuelve a por leer', async () => {
    const book = await deps.items.createItem({ type: 'libro', title: 'A' });
    expect(await actions.toggleDone(deps, book.id)).toMatchObject({ readingState: 'leido', status: 'leido' });
    expect(await actions.toggleDone(deps, book.id)).toMatchObject({ readingState: 'por_leer', status: 'por_leer' });
  });

  it('mover una idea a Libros la deja por leer; sacarla de Libros quita el estado', async () => {
    const idea = await deps.items.createItem({ type: 'idea', title: 'Leer Dune' });
    expect(await actions.moveItem(deps, idea.id, { type: 'libro', author: ' Herbert ' })).toMatchObject({
      type: 'libro',
      readingState: 'por_leer',
      author: 'Herbert',
    });
    expect(await actions.moveItem(deps, idea.id, { type: 'idea' })).toMatchObject({ type: 'idea', readingState: null });
  });
});
