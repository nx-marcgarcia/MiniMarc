import { describe, expect, it } from 'vitest';
import { formatMoney, groupByStore, groupByUrgency, lineTotal, priceText, totalOf } from '@/lib/compras';
import { makeItem } from './screens/setup';

const compra = (id: string, title: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'compra', title, status: 'quiero', area: null, createdAt: `2026-11-0${id.length}T10:00:00.000Z`, ...over });
const data = (d: Record<string, unknown>) => ({ data: { quantity: 1, currency: 'EUR', ...d } });

const stores = [
  { id: 's1', name: 'Aliexpress', domain: 'aliexpress.com', favicon: 'https://aliexpress.com/favicon.ico' },
  { id: 's2', name: 'Casio', domain: 'casio.com', favicon: null },
  { id: 's3', name: 'Amazon', domain: 'amazon.es', favicon: null },
];

describe('formatMoney', () => {
  it('con decimales a la española y la moneda', () => {
    expect(formatMoney(25, 'EUR')).toMatch(/^25,00\s€$/);
    expect(formatMoney(12.5, 'EUR')).toMatch(/^12,50\s€$/);
    expect(formatMoney(1299, 'EUR')).toMatch(/^1299,00\s€$|^1\.299,00\s€$/);
    expect(formatMoney(9.99, 'USD')).toMatch(/9,99/);
  });
});

describe('priceText y lineTotal', () => {
  it('sin precio no hay texto ni total', () => {
    expect(priceText(compra('a', 'x', data({})))).toBeNull();
    expect(lineTotal(compra('a', 'x', data({})))).toBeNull();
  });

  it('una unidad: el precio', () => {
    expect(priceText(compra('a', 'x', data({ price: 25 })))).toMatch(/^25,00\s€$/);
    expect(lineTotal(compra('a', 'x', data({ price: 25 })))).toBe(25);
  });

  it('varias unidades: "2 × 12,50 €" y el total de la línea', () => {
    const it = compra('a', 'x', data({ price: 12.5, quantity: 2 }));
    expect(priceText(it)).toMatch(/^2 × 12,50\s€$/);
    expect(lineTotal(it)).toBe(25);
  });
});

describe('totalOf', () => {
  it('suma las líneas con precio y cuenta las que no lo tienen', () => {
    expect(totalOf([compra('a', 'x', data({ price: 10, quantity: 2 })), compra('b', 'y', data({ price: 5 })), compra('c', 'z', data({}))])).toEqual({ amount: 25, currency: 'EUR', unpriced: 1 });
  });

  it('sin ningún precio no hay total', () => {
    expect(totalOf([compra('a', 'x', data({}))])).toBeNull();
    expect(totalOf([])).toBeNull();
  });

  it('con monedas distintas no se suman', () => {
    expect(totalOf([compra('a', 'x', data({ price: 10 })), compra('b', 'y', { data: { quantity: 1, currency: 'USD', price: 5 } })])).toBeNull();
  });

  it('no suma redondeos raros', () => {
    expect(totalOf([compra('a', 'x', data({ price: 0.1 })), compra('b', 'y', data({ price: 0.2 }))])?.amount).toBe(0.3);
  });
});

describe('groupByStore', () => {
  const items = [
    compra('a', 'Masaje', { storeId: 's1', ...data({ price: 10 }) }),
    compra('bb', 'Cajón', { storeId: 's1', ...data({ price: 15 }) }),
    compra('ccc', 'Reloj', { storeId: 's2' }),
    compra('dddd', 'Leche'),
    compra('eeeee', 'Pilas', { storeId: 'borrada' }),
  ];

  it('una sección por tienda, por orden alfabético, y "Sin tienda" al final', () => {
    const groups = groupByStore(items, stores);
    expect(groups.map((g) => g.title)).toEqual(['Aliexpress', 'Casio', 'Sin tienda']);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1, 2]);
  });

  it('cada sección lleva su tienda, su total y los precios que faltan', () => {
    const [ali, casio, none] = groupByStore(items, stores);
    expect(ali.store?.id).toBe('s1');
    expect(ali.total).toEqual({ amount: 25, currency: 'EUR', unpriced: 0 });
    expect(casio.total).toBeNull();
    expect(none.store).toBeNull();
  });

  it('una tienda sin items no sale; una que ya no existe cuenta como sin tienda', () => {
    const groups = groupByStore(items, stores);
    expect(groups.find((g) => g.title === 'Amazon')).toBeUndefined();
    expect(groups.at(-1)?.items.map((i) => i.title).sort()).toEqual(['Leche', 'Pilas']);
  });

  it('dentro de una tienda, lo más reciente primero', () => {
    expect(groupByStore(items, stores)[0].items.map((i) => i.id)).toEqual(['bb', 'a']);
  });

  it('sin compras no hay secciones', () => {
    expect(groupByStore([], stores)).toEqual([]);
  });
});

describe('groupByUrgency', () => {
  it('alta, media, baja y sin urgencia, solo las que tienen algo', () => {
    const items = [
      compra('a', 'x', data({ urgency: 'baja' })),
      compra('bb', 'y', data({ urgency: 'alta' })),
      compra('ccc', 'z', data({})),
      compra('dddd', 'w', data({ urgency: 'alta' })),
    ];
    const groups = groupByUrgency(items);
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([['Urgente', 2], ['Baja', 1], ['Sin urgencia', 1]]);
  });
});
