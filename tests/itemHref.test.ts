import { describe, expect, it } from 'vitest';
import { itemHref } from '@/lib/items/href';
import { makeItem } from './screens/setup';

describe('itemHref: dónde vive cada item', () => {
  it.each([
    [{ type: 'tarea', area: 'personal' }, '/tareas?area=personal'],
    [{ type: 'tarea', area: 'trabajo' }, '/tareas?area=trabajo'],
    [{ type: 'tarea', area: null }, '/tareas?area=personal'],
    [{ type: 'idea' }, '/ideas'],
    [{ type: 'compra' }, '/compras'],
    [{ type: 'libro' }, '/libros'],
    [{ type: 'enlace' }, '/enlaces'],
    [{ type: 'nota' }, '/notas'],
    [{ type: 'regalo', personId: 'p1' }, '/personas/p1'],
    [{ type: 'regalo', personId: null }, '/regalos'],
  ] as const)('%j → %s', (over, href) => {
    expect(itemHref(makeItem(over as never))).toBe(href);
  });
});
