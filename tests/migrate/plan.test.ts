import { describe, expect, it } from 'vitest';
import { buildPlan, deriveId, renderReport, type MigrationAi, type Op } from '@/lib/migrate/plan';

const NOW = new Date('2026-11-16T10:00:00Z');

const base = {
  notes: null,
  area: null,
  status: 'pendiente',
  personId: null,
  link: null,
  linkTitle: null,
  linkImage: null,
  linkSite: null,
  author: null,
  readingState: null,
  sourceText: null,
  needsReview: false,
  createdAt: '2026-09-01T10:00:00.000Z',
  deletedAt: null,
};

const aliexpress = { ...base, id: 'c1', type: 'compra', title: 'Aliexpress', notes: 'Masaje de cabeza, Cajón organizador de cajones para calcetines', createdAt: '2026-09-02T08:00:00.000Z' };
const casio = {
  ...base,
  id: 'c2',
  type: 'compra',
  title: 'Casio',
  link: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/',
  linkTitle: 'MTP-B220BL-1AV',
  linkImage: 'https://www.casio.com/i.png',
  linkSite: 'casio.com',
};
const rosendo = { id: 'p1', name: 'Rosendo', birthday: '1960-01-14', notes: 'Caja reloj buen regalo' };

/** Una IA de mentira: responde lo que cada test necesita y apunta a qué se le preguntó. */
function fakeAi(over: Partial<MigrationAi> = {}) {
  const calls: string[] = [];
  const ai: MigrationAi = {
    async splitCompra({ title }) {
      calls.push(`compra:${title}`);
      if (title === 'Aliexpress') {
        return {
          store: { name: 'Aliexpress', domain: 'aliexpress.com' },
          products: [
            { title: 'Masaje de cabeza', link: null, price: null, notes: null },
            { title: 'Cajón organizador de calcetines', link: null, price: null, notes: null },
          ],
        };
      }
      if (title === 'Casio') {
        return { store: { name: 'Casio', domain: 'casio.com' }, products: [{ title: 'Casio MTP-B220BL-1AV', link: null, price: null, notes: null }] };
      }
      return { store: null, products: [{ title, link: null, price: null, notes: null }] };
    },
    async giftsFromNotes({ name }) {
      calls.push(`gifts:${name}`);
      return { gifts: [{ title: 'Caja para relojes', approxPrice: 30, link: null }], remainingNotes: '' };
    },
    async checkIdea({ title }) {
      calls.push(`idea:${title}`);
      return title === 'Trabajar' ? { isIdea: false, confidence: 0.9, suggestion: 'tarea' } : { isIdea: true, confidence: 0.95, suggestion: null };
    },
    ...over,
  };
  return { ai, calls };
}

const of = <T extends Op['op']>(plan: { ops: Op[] }, kind: T) => plan.ops.filter((o): o is Extract<Op, { op: T }> => o.op === kind);

describe('deriveId', () => {
  it('es determinista y con forma de uuid', () => {
    expect(deriveId('c1', '0')).toBe(deriveId('c1', '0'));
    expect(deriveId('c1', '0')).not.toBe(deriveId('c1', '1'));
    expect(deriveId('c1', '0')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('buildPlan · compras', () => {
  it('"Aliexpress" con varios productos en la nota: dos compras con la tienda, y el original archivado', async () => {
    const { ai } = fakeAi();
    const plan = await buildPlan({ items: [aliexpress], people: [] }, ai, { now: NOW });
    const creates = of(plan, 'create-item');
    expect(creates.map((c) => c.item.title)).toEqual(['Masaje de cabeza', 'Cajón organizador de calcetines']);
    for (const c of creates) {
      expect(c.item).toMatchObject({ type: 'compra', store: { name: 'Aliexpress', domain: 'aliexpress.com' } });
      expect(c.item.sourceText).toContain('Masaje de cabeza, Cajón organizador');
      expect(c.createdAt).toBe('2026-09-02T08:00:00.000Z');
    }
    expect(creates.map((c) => c.id)).toEqual([deriveId('c1', '0'), deriveId('c1', '1')]);
    expect(of(plan, 'archive-item').map((o) => o.id)).toEqual(['c1']);
    expect(plan.ops.some((o) => 'id' in o && o.id === 'c1' && o.op === 'update-item')).toBe(false);
  });

  it('"Casio" con su enlace: una sola compra, actualizada en su sitio con tienda y modelo', async () => {
    const { ai } = fakeAi();
    const plan = await buildPlan({ items: [casio], people: [] }, ai, { now: NOW });
    expect(of(plan, 'create-item')).toEqual([]);
    expect(of(plan, 'archive-item')).toEqual([]);
    const [up] = of(plan, 'update-item');
    expect(up).toMatchObject({ id: 'c2', patch: { title: 'Casio MTP-B220BL-1AV', store: { name: 'Casio', domain: 'casio.com' } } });
    expect(up.patch.sourceText).toBe('Casio');
  });

  it('el enlace y su vista previa pasan a item_links', async () => {
    const { ai } = fakeAi();
    const plan = await buildPlan({ items: [casio], people: [] }, ai, { now: NOW });
    expect(of(plan, 'add-link')).toEqual([
      expect.objectContaining({ itemId: 'c2', url: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/', title: 'MTP-B220BL-1AV', image: 'https://www.casio.com/i.png' }),
    ]);
  });

  it('si la IA falla con un item, ese queda como estaba y el resto sigue', async () => {
    const { ai } = fakeAi({
      async splitCompra({ title }) {
        if (title === 'Aliexpress') throw new Error('cuota');
        return { store: null, products: [{ title, link: null, price: null, notes: null }] };
      },
    });
    const plan = await buildPlan({ items: [aliexpress, { ...casio, link: null }], people: [] }, ai, { now: NOW });
    expect(plan.failures).toEqual([expect.objectContaining({ id: 'c1' })]);
    expect(plan.ops.some((o) => 'id' in o && o.id === 'c1')).toBe(false);
  });

  it('una compra ya migrada (con tienda en data o archivada) no se vuelve a procesar', async () => {
    const { ai, calls } = fakeAi();
    await buildPlan({ items: [{ ...aliexpress, archived: true }, { ...casio, deletedAt: '2026-10-01T00:00:00Z' }], people: [] }, ai, { now: NOW });
    expect(calls).toEqual([]);
  });
});

describe('buildPlan · personas y regalos', () => {
  it('saca las ideas de regalo de las notas de la persona y las enlaza', async () => {
    const { ai } = fakeAi();
    const plan = await buildPlan({ items: [], people: [rosendo] }, ai, { now: NOW });
    const [gift] = of(plan, 'create-item');
    expect(gift).toMatchObject({
      id: deriveId('p1', 'gift', 'caja para relojes'),
      item: { type: 'regalo', title: 'Caja para relojes', personId: 'p1', data: { approxPrice: 30 }, sourceText: 'Caja reloj buen regalo' },
    });
    // Las notas no se tocan salvo que se pida.
    expect(of(plan, 'set-person-notes')).toEqual([]);
  });

  it('con cleanNotes reescribe las notas con lo que sobra', async () => {
    const { ai } = fakeAi({ giftsFromNotes: async () => ({ gifts: [{ title: 'Caja para relojes', approxPrice: null, link: null }], remainingNotes: 'Le gusta el té' }) });
    const plan = await buildPlan({ items: [], people: [rosendo] }, ai, { now: NOW, cleanNotes: true });
    expect(of(plan, 'set-person-notes')).toEqual([expect.objectContaining({ id: 'p1', notes: 'Le gusta el té' })]);
  });

  it('no repite un regalo que la persona ya tiene', async () => {
    const { ai } = fakeAi();
    const existing = { ...base, id: 'g1', type: 'regalo', title: 'caja para relojes', personId: 'p1' };
    const plan = await buildPlan({ items: [existing], people: [rosendo] }, ai, { now: NOW });
    expect(of(plan, 'create-item')).toEqual([]);
  });

  it('fusiona personas duplicadas (mamá y Mama) y las ideas pasan a la que se queda', async () => {
    const { ai } = fakeAi();
    const people = [
      { id: 'a', name: 'mamá', birthday: null, notes: 'Le gusta leer' },
      { id: 'b', name: 'Mama', birthday: '1965-03-02', notes: null },
    ];
    const items = [{ ...base, id: 'g1', type: 'regalo', title: 'Libro', personId: 'b' }, { ...base, id: 'g2', type: 'regalo', title: 'Bufanda', personId: 'b' }];
    const plan = await buildPlan({ items, people }, ai, { now: NOW });
    expect(of(plan, 'merge-person')).toEqual([expect.objectContaining({ keep: 'b', drop: ['a'] })]);
  });
});

describe('buildPlan · ideas', () => {
  const idea = (id: string, title: string, over: Record<string, unknown> = {}) => ({ ...base, id, type: 'idea', title, ...over });

  it('"Trabajar" no es una idea: va a la Bandeja', async () => {
    const { ai } = fakeAi();
    const plan = await buildPlan({ items: [idea('i1', 'Trabajar'), idea('i2', 'App para organizar shorts')], people: [] }, ai, { now: NOW });
    expect(of(plan, 'update-item')).toEqual([expect.objectContaining({ id: 'i1', patch: { needsReview: true } })]);
    expect(renderReport(plan)).toContain('Trabajar');
  });

  it('una idea con confianza baja también va a la Bandeja', async () => {
    const { ai } = fakeAi({ checkIdea: async () => ({ isIdea: true, confidence: 0.3, suggestion: null }) });
    const plan = await buildPlan({ items: [idea('i1', 'cosa rara')], people: [] }, ai, { now: NOW });
    expect(of(plan, 'update-item')[0].patch.needsReview).toBe(true);
  });

  it('las ideas en "hecho" se listan para decidir y toman en_marcha por defecto', async () => {
    const { ai } = fakeAi();
    const done = idea('i3', 'Blog de viajes', { status: 'hecho' });
    const plan = await buildPlan({ items: [done], people: [] }, ai, { now: NOW });
    expect(plan.decisions).toEqual([{ id: 'i3', title: 'Blog de viajes', default: 'en_marcha' }]);
    expect(of(plan, 'update-item').filter((o) => o.patch.status)).toEqual([]);
  });

  it('una decisión de Marc sustituye al valor por defecto', async () => {
    const { ai } = fakeAi();
    const done = idea('i3', 'Blog de viajes', { status: 'hecho' });
    const plan = await buildPlan({ items: [done], people: [] }, ai, { now: NOW, ideasDone: { i3: 'descartada' } });
    expect(of(plan, 'update-item')).toEqual([expect.objectContaining({ id: 'i3', patch: expect.objectContaining({ status: 'descartada' }) })]);
  });

  it('el rawStatus de una exportación nueva manda sobre el estado ya traducido', async () => {
    const { ai } = fakeAi();
    const done = idea('i3', 'Blog', { status: 'en_marcha', rawStatus: 'hecho' });
    const plan = await buildPlan({ items: [done], people: [] }, ai, { now: NOW });
    expect(plan.decisions.map((d) => d.id)).toEqual(['i3']);
  });
});

describe('buildPlan · privacidad de Trabajo', () => {
  it('nada con área Trabajo llega a la IA', async () => {
    const { ai, calls } = fakeAi();
    const items = [
      { ...base, id: 'w1', type: 'compra', title: 'Monitor', area: 'trabajo' },
      { ...base, id: 'w2', type: 'idea', title: 'Idea de equipo', area: 'trabajo' },
      { ...base, id: 'w3', type: 'tarea', title: 'Informe', area: 'trabajo' },
    ];
    await buildPlan({ items, people: [] }, ai, { now: NOW });
    expect(calls).toEqual([]);
  });
});

describe('buildPlan · libros y enlaces', () => {
  it('el autor del libro pasa a sus campos propios', async () => {
    const { ai } = fakeAi();
    const libro = { ...base, id: 'l1', type: 'libro', title: 'Sapiens', author: 'Harari', readingState: 'leyendo' };
    const plan = await buildPlan({ items: [libro], people: [] }, ai, { now: NOW });
    expect(of(plan, 'update-item')).toEqual([expect.objectContaining({ id: 'l1', patch: { data: { author: 'Harari' } } })]);
  });

  it('acepta una exportación antigua, sin los campos de la fase 1', async () => {
    const { ai } = fakeAi();
    const plan = await buildPlan({ items: [{ id: 'x', type: 'tarea', title: 'T', createdAt: '2026-01-01T00:00:00Z' }], people: [] }, ai, { now: NOW });
    expect(plan.ops).toEqual([]);
  });

  it('una exportación que no es una exportación se rechaza', async () => {
    const { ai } = fakeAi();
    await expect(buildPlan({ nada: 1 }, ai, { now: NOW })).rejects.toThrow();
  });
});
