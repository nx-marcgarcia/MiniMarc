import { beforeEach, describe, expect, it } from 'vitest';
import { createItemsRepo } from '@/lib/db/items';
import { createLinksRepo } from '@/lib/db/links';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createStoresRepo } from '@/lib/db/stores';
import { collectExport } from '@/lib/export/serialize';
import { applyPlan, type ApplyDeps } from '@/lib/migrate/apply';
import { buildPlan, type MigrationAi, type Plan } from '@/lib/migrate/plan';

const NOW = new Date('2026-11-16T10:00:00Z');

const ai: MigrationAi = {
  async splitCompra({ title }) {
    if (title === 'Aliexpress') {
      return {
        store: { name: 'Aliexpress', domain: 'aliexpress.com' },
        products: [
          { title: 'Masaje de cabeza', link: null, price: null, notes: null },
          { title: 'Cajón organizador de calcetines', link: null, price: null, notes: null },
        ],
      };
    }
    if (title === 'Casio') return { store: { name: 'Casio', domain: 'casio.com' }, products: [{ title: 'Casio MTP-B220BL-1AV', link: null, price: null, notes: null }] };
    return { store: null, products: [{ title, link: null, price: null, notes: null }] };
  },
  async giftsFromNotes({ name }) {
    return name === 'Rosendo' ? { gifts: [{ title: 'Caja para relojes', approxPrice: 30, link: null }], remainingNotes: '' } : { gifts: [], remainingNotes: '' };
  },
  async checkIdea({ title }) {
    return title === 'Trabajar' ? { isIdea: false, confidence: 0.9, suggestion: 'tarea' } : { isIdea: true, confidence: 0.95, suggestion: null };
  },
};

let backend: ReturnType<typeof createMemoryBackend>;
let deps: ApplyDeps;

async function seed() {
  // Filas como las dejó la app antes de la fase 1: estados pendiente / hecho / archivado, reading_state.
  const row = (r: Record<string, unknown>) => backend.insert('items', { status: 'pendiente', ...r });
  await row({ type: 'compra', title: 'Aliexpress', notes: 'Masaje de cabeza, Cajón organizador de cajones para calcetines', created_at: '2026-09-02T08:00:00.000Z' });
  await row({ type: 'compra', title: 'Casio', link: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/', link_title: 'MTP-B220BL-1AV', link_site: 'casio.com' });
  await row({ type: 'compra', title: 'Leche', status: 'hecho' });
  await row({ type: 'idea', title: 'Trabajar' });
  await row({ type: 'idea', title: 'Blog de viajes', status: 'hecho' });
  await row({ type: 'libro', title: 'Sapiens', author: 'Harari', reading_state: 'leyendo' });
  await row({ type: 'tarea', title: 'Informe', area: 'trabajo', status: 'archivado' });
  const rosendo = await backend.insert('people', { name: 'Rosendo', birthday: '1960-01-14', notes: 'Caja reloj buen regalo' });
  const a = await backend.insert('people', { name: 'mamá', birthday: null, notes: 'Le gusta leer' });
  const b = await backend.insert('people', { name: 'Mama', birthday: '1965-03-02', notes: null });
  await row({ type: 'regalo', title: 'Libro', person_id: b.id, status: 'pendiente' });
  await row({ type: 'regalo', title: 'Bufanda', person_id: b.id, status: 'pendiente' });
  await backend.insert('person_dates', { person_id: a.id, label: 'Santo', date: '1604-07-26', yearly: true });
  return { rosendo, a, b };
}

async function plan(opts: Parameters<typeof buildPlan>[2] = {}): Promise<Plan> {
  const exported = await collectExport({ backend, settings: async () => ({ digestHour: 8, tz: 'Europe/Madrid', weeklyDigest: 'off' }), tokens: async () => [] });
  return buildPlan(JSON.parse(JSON.stringify(exported)), ai, { now: NOW, ...opts });
}

beforeEach(() => {
  backend = createMemoryBackend({ now: () => NOW });
  deps = {
    backend,
    items: createItemsRepo(backend, { now: () => NOW }),
    people: createPeopleRepo(backend),
    stores: createStoresRepo(backend),
    links: createLinksRepo(backend),
  };
});

const byTitle = async () => Object.fromEntries((await deps.items.listItems()).map((i) => [i.title, i]));

describe('applyPlan (de extremo a extremo, sobre filas anteriores a la fase 1)', () => {
  it('traduce los estados antiguos y reparte compras, regalos y Bandeja', async () => {
    const { rosendo, b } = await seed();
    const p = await plan();
    const result = await applyPlan(p, deps);
    expect(result.failed).toEqual([]);

    const items = await byTitle();
    // Estados antiguos → estados del tipo; archivado → flag.
    expect(items.Leche).toMatchObject({ status: 'comprado' });
    expect(items['Blog de viajes']).toMatchObject({ status: 'en_marcha' });
    expect(items.Informe).toMatchObject({ archived: true, status: 'pendiente' });
    expect(items.Sapiens).toMatchObject({ status: 'leyendo', readingState: 'leyendo', data: { author: 'Harari' } });
    // Dudoso → Bandeja.
    expect(items.Trabajar.needsReview).toBe(true);
    // Casio: en su sitio, con tienda.
    const stores = await deps.stores.listStores();
    expect(stores.map((s) => s.name).sort()).toEqual(['Aliexpress', 'Casio']);
    expect(items['Casio MTP-B220BL-1AV']).toMatchObject({ storeId: stores.find((s) => s.name === 'Casio')?.id });
    expect((await deps.links.listLinks(items['Casio MTP-B220BL-1AV'].id))[0]).toMatchObject({ url: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/', domain: 'casio.com' });
    // Aliexpress: dos compras nuevas con su tienda y fecha, y el original archivado, no borrado.
    const ali = stores.find((s) => s.name === 'Aliexpress')!;
    expect(items['Masaje de cabeza']).toMatchObject({ type: 'compra', storeId: ali.id, createdAt: '2026-09-02T08:00:00.000Z' });
    expect(items['Cajón organizador de calcetines']).toMatchObject({ storeId: ali.id });
    expect(items.Aliexpress).toMatchObject({ archived: true, deletedAt: null });
    // Rosendo: su idea de regalo, enlazada y con precio.
    expect(items['Caja para relojes']).toMatchObject({ type: 'regalo', personId: rosendo.id, status: 'idea', data: { approxPrice: 30 } });
    // Mamá y Mama: una sola persona (la que más ideas tenía), con todo lo de las dos y el otro nombre como alias.
    const people = await deps.people.listPeople();
    expect(people.map((x) => x.name).sort()).toEqual(['Mama', 'Rosendo']);
    const mama = people.find((x) => x.id === b.id)!;
    expect(mama.birthday).toBe('1965-03-02');
    expect(mama.notes).toBe('Le gusta leer');
    expect(mama.alias).toEqual(['mamá']);
    expect((await deps.people.listDates(mama.id)).map((d) => d.label)).toEqual(['Santo']);
    expect([items.Libro, items.Bufanda].map((i) => i.personId)).toEqual([mama.id, mama.id]);
  });

  it('aplicar el plan dos veces no duplica nada', async () => {
    await seed();
    const p = await plan();
    await applyPlan(p, deps);
    const snapshot = async () => ({
      items: (await backend.select('items')).length,
      links: (await backend.select('item_links')).length,
      stores: (await backend.select('stores')).length,
      people: (await backend.select('people')).length,
      dates: (await backend.select('person_dates')).length,
    });
    const first = await snapshot();
    const again = await applyPlan(p, deps);
    expect(again.failed).toEqual([]);
    expect(await snapshot()).toEqual(first);
  });

  it('volver a preparar el plan tras aplicarlo no propone nada nuevo sobre lo ya hecho', async () => {
    await seed();
    await applyPlan(await plan(), deps);
    const second = await plan();
    expect(second.ops.filter((o) => o.op === 'create-item' || o.op === 'archive-item' || o.op === 'merge-person')).toEqual([]);
  });

  it('una operación que falla no detiene las demás y queda anotada', async () => {
    await seed();
    const p = await plan();
    const broken: Plan = { ...p, ops: [{ op: 'add-link', itemId: 'x', url: 'javascript:alert(1)', reason: 'prueba' }, ...p.ops] };
    const result = await applyPlan(broken, deps);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].op.op).toBe('add-link');
    expect((await byTitle()).Trabajar.needsReview).toBe(true);
  });

  it('una decisión sobre una idea hecha se aplica', async () => {
    await seed();
    const blog = (await deps.items.listItems()).find((i) => i.title === 'Blog de viajes')!;
    await applyPlan(await plan({ ideasDone: { [blog.id]: 'descartada' } }), deps);
    expect((await byTitle())['Blog de viajes']).toMatchObject({ status: 'descartada', completedAt: expect.any(String) });
  });
});
