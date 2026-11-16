import { describe, expect, it } from 'vitest';
import {
  defaultStatus,
  isDoneStatus,
  isItemType,
  isValidStatus,
  ITEM_TYPE_IDS,
  ITEM_TYPES,
  parseItemData,
} from '@/lib/items/itemTypes';

describe('registro de tipos', () => {
  it('incluye los cinco tipos actuales y enlace y nota', () => {
    expect([...ITEM_TYPE_IDS].sort()).toEqual(['compra', 'enlace', 'idea', 'libro', 'nota', 'regalo', 'tarea']);
  });

  it.each(ITEM_TYPE_IDS)('%s tiene nombre, icono, estados coherentes y vista por defecto', (id) => {
    const t = ITEM_TYPES[id];
    expect(t.label).toBeTruthy();
    expect(t.plural).toBeTruthy();
    expect(t.icon).toBeTruthy();
    expect(['list', 'cards', 'grouped']).toContain(t.defaultView);
    const ids = t.states.map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(t.initialState);
    for (const done of t.doneStates) expect(ids).toContain(done);
    // Un estado inicial no puede ser "hecho": un item nuevo siempre está abierto.
    expect(t.doneStates).not.toContain(t.initialState);
  });

  it('los estados son los de la spec', () => {
    const states = (id: (typeof ITEM_TYPE_IDS)[number]) => ITEM_TYPES[id].states.map((s) => s.id);
    expect(states('tarea')).toEqual(['pendiente', 'hecha']);
    expect(states('idea')).toEqual(['semilla', 'explorando', 'en_marcha', 'descartada']);
    expect(states('compra')).toEqual(['quiero', 'en_carrito', 'comprado', 'descartado']);
    expect(states('regalo')).toEqual(['idea', 'comprado', 'envuelto', 'entregado']);
    expect(states('libro')).toEqual(['por_leer', 'leyendo', 'leido', 'abandonado']);
    expect(states('enlace')).toEqual(['por_ver', 'visto']);
  });

  it('las ideas no llevan check de completar; las tareas sí', () => {
    expect(ITEM_TYPES.idea.hasCheck).toBe(false);
    expect(ITEM_TYPES.tarea.hasCheck).toBe(true);
  });
});

describe('estados', () => {
  it('defaultStatus da el estado inicial del tipo', () => {
    expect(defaultStatus('compra')).toBe('quiero');
    expect(defaultStatus('idea')).toBe('semilla');
    expect(defaultStatus('tarea')).toBe('pendiente');
  });

  it('isValidStatus solo acepta estados del propio tipo', () => {
    expect(isValidStatus('compra', 'en_carrito')).toBe(true);
    expect(isValidStatus('compra', 'hecho')).toBe(false);
    expect(isValidStatus('tarea', 'comprado')).toBe(false);
  });

  it('isDoneStatus marca los estados que cierran el item', () => {
    expect(isDoneStatus('tarea', 'hecha')).toBe(true);
    expect(isDoneStatus('tarea', 'pendiente')).toBe(false);
    expect(isDoneStatus('compra', 'comprado')).toBe(true);
    expect(isDoneStatus('compra', 'descartado')).toBe(true);
  });

  it('isItemType reconoce tipos del registro', () => {
    expect(isItemType('compra')).toBe(true);
    expect(isItemType('viaje')).toBe(false);
    expect(isItemType(42)).toBe(false);
  });
});

describe('parseItemData', () => {
  it('una compra toma cantidad 1 y moneda EUR por defecto', () => {
    expect(parseItemData('compra', {})).toEqual({ quantity: 1, currency: 'EUR' });
  });

  it('acepta una compra completa', () => {
    const data = parseItemData('compra', {
      quantity: 2,
      price: 12.5,
      currency: 'USD',
      variant: 'talla M',
      urgency: 'alta',
      purchasedAt: '2026-11-02',
      finalPrice: 11,
      warrantyEndsAt: '2028-11-02',
    });
    expect(data).toMatchObject({ quantity: 2, price: 12.5, currency: 'USD', urgency: 'alta' });
  });

  it.each([
    ['cantidad 0', { quantity: 0 }],
    ['precio negativo', { price: -1 }],
    ['moneda de 4 letras', { currency: 'EURO' }],
    ['urgencia desconocida', { urgency: 'urgentísima' }],
    ['fecha imposible', { purchasedAt: '2026-02-31' }],
    ['clave que no existe', { precio: 3 }],
  ])('rechaza una compra con %s', (_name, data) => {
    expect(() => parseItemData('compra', data)).toThrow();
  });

  it('una idea admite potencial de 1 a 5 y rechaza el resto', () => {
    expect(parseItemData('idea', { category: 'app', potential: 5 })).toEqual({ category: 'app', potential: 5 });
    expect(() => parseItemData('idea', { potential: 6 })).toThrow();
    expect(() => parseItemData('idea', { potential: 0 })).toThrow();
  });

  it('una tarea usa la recurrencia y los contextos que ya existen', () => {
    expect(parseItemData('tarea', { recurrence: 'semanal', context: 'recados', estimateMin: 30 })).toEqual({
      recurrence: 'semanal',
      context: 'recados',
      estimateMin: 30,
    });
    expect(() => parseItemData('tarea', { recurrence: 'cada dos días' })).toThrow();
  });

  it('una tarea admite subtareas con su estado', () => {
    const data = parseItemData('tarea', { subtasks: [{ title: 'Llamar', done: false }] });
    expect(data).toEqual({ subtasks: [{ title: 'Llamar', done: false }] });
    expect(() => parseItemData('tarea', { subtasks: [{ title: '', done: false }] })).toThrow();
  });

  it('un libro valora de 1 a 5; un regalo y un enlace validan sus campos', () => {
    expect(() => parseItemData('libro', { rating: 6 })).toThrow();
    expect(parseItemData('libro', { pages: 320, rating: 4, recommendedBy: 'Aina' })).toMatchObject({ pages: 320 });
    expect(parseItemData('regalo', { occasion: 'Cumpleaños', approxPrice: 30 })).toEqual({
      occasion: 'Cumpleaños',
      approxPrice: 30,
    });
    expect(parseItemData('enlace', { kind: 'video' })).toEqual({ kind: 'video' });
    expect(() => parseItemData('enlace', { kind: 'podcast' })).toThrow();
  });

  it('una nota no tiene campos propios', () => {
    expect(parseItemData('nota', {})).toEqual({});
    expect(() => parseItemData('nota', { algo: 1 })).toThrow();
  });

  it('un tipo que no está en el registro se rechaza', () => {
    expect(() => parseItemData('viaje', {})).toThrow(/tipo/i);
  });
});
