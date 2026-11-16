import { describe, expect, it } from 'vitest';
import { describeCapture } from '@/lib/capture/describe';
import type { CaptureResult } from '@/lib/capture/pipeline';
import { makeItem } from '../screens/setup';

const names = {
  people: [
    { id: 'p1', name: 'Rosendo', birthday: '1960-01-14' },
    { id: 'p2', name: 'Aina', birthday: null },
  ],
  stores: [{ id: 's1', name: 'Aliexpress' }, { id: 's2', name: 'Casio' }],
  today: '2026-11-16',
};

const item = (over: Record<string, unknown>) => makeItem({ area: null, status: 'quiero', ...over });
const result = (items: ReturnType<typeof item>[], over: Partial<CaptureResult> = {}): CaptureResult => ({ items, eventIds: [], ...over });

describe('describeCapture', () => {
  it('2 compras de la misma tienda: "2 compras en Aliexpress"', () => {
    const r = describeCapture(result([item({ id: 'a', type: 'compra', title: 'Masaje', storeId: 's1' }), item({ id: 'b', type: 'compra', title: 'Cajón', storeId: 's1' })]), names);
    expect(r.lines).toEqual(['2 compras en Aliexpress']);
    expect(r.items.map((i) => i.storeName)).toEqual(['Aliexpress', 'Aliexpress']);
  });

  it('una compra sin tienda: "1 compra"', () => {
    expect(describeCapture(result([item({ id: 'a', type: 'compra', title: 'Leche' })]), names).lines).toEqual(['1 compra']);
  });

  it('compras de tiendas distintas van en líneas distintas', () => {
    const r = describeCapture(result([item({ id: 'a', type: 'compra', storeId: 's1' }), item({ id: 'b', type: 'compra', storeId: 's2' })]), names);
    expect(r.lines).toEqual(['1 compra en Aliexpress', '1 compra en Casio']);
  });

  it('regalo: "Regalo para Rosendo · Cumpleaños 14 ene"', () => {
    const r = describeCapture(result([item({ id: 'g', type: 'regalo', title: 'Caja', personId: 'p1', data: { occasion: 'Cumpleaños', approxPrice: 30 } })]), names);
    expect(r.lines).toEqual(['Regalo para Rosendo · Cumpleaños 14 ene · 30 €']);
    expect(r.items[0].personName).toBe('Rosendo');
  });

  it('regalo sin cumpleaños conocido o con otra ocasión', () => {
    expect(describeCapture(result([item({ id: 'g', type: 'regalo', personId: 'p2', data: { occasion: 'Cumpleaños' } })]), names).lines).toEqual(['Regalo para Aina · Cumpleaños']);
    expect(describeCapture(result([item({ id: 'g', type: 'regalo', personId: 'p1', data: { occasion: 'Navidad' } })]), names).lines).toEqual(['Regalo para Rosendo · Navidad']);
    expect(describeCapture(result([item({ id: 'g', type: 'regalo' })]), names).lines).toEqual(['Regalo sin persona']);
  });

  it('tarea con fecha y hora, y sin ellas', () => {
    expect(describeCapture(result([item({ id: 't', type: 'tarea', status: 'pendiente', dueAt: '2026-11-19T09:00:00.000Z', hasTime: true })]), names).lines).toEqual(['Tarea · 19 nov 10:00']);
    expect(describeCapture(result([item({ id: 't', type: 'tarea', status: 'pendiente' })]), names).lines).toEqual(['Tarea']);
  });

  it('idea, libro, nota y enlace', () => {
    const r = describeCapture(
      result([
        item({ id: '1', type: 'idea', status: 'semilla' }),
        item({ id: '2', type: 'libro', title: 'Sapiens', status: 'por_leer' }),
        item({ id: '3', type: 'nota', status: 'activa' }),
        item({ id: '4', type: 'enlace', status: 'por_ver', data: { kind: 'video' } }),
      ]),
      names,
    );
    expect(r.lines).toEqual(['Idea', 'Libro «Sapiens»', 'Nota', 'Enlace · vídeo']);
  });

  it('lo dudoso va a la Bandeja con la sugerencia', () => {
    const r = describeCapture(result([item({ id: 'x', type: 'idea', title: 'Trabajar', needsReview: true, suggestion: { type: 'tarea', confidence: 0.2 } })]), names);
    expect(r.lines).toEqual(['«Trabajar» a la Bandeja (¿tarea?)']);
    expect(r.items[0].needsReview).toBe(true);
  });

  it('citas en Calendar y fechas de personas', () => {
    expect(describeCapture(result([], { eventIds: ['e1'] }), names).lines).toEqual(['1 cita en Calendar']);
    expect(describeCapture(result([], { eventIds: ['e1', 'e2'] }), names).lines).toEqual(['2 citas en Calendar']);
    expect(describeCapture(result([], { dates: [{ personId: 'p1', personName: 'Rosendo', label: 'Aniversario', date: '1604-02-14' }] }), names).lines).toEqual(['Fecha de Rosendo · Aniversario']);
  });

  it('un posible duplicado se anota en su item', () => {
    const r = describeCapture(result([item({ id: 'n', type: 'compra', title: 'Casio MTP-B220BL' })], { duplicates: [{ itemId: 'n', existingId: 'old' }] }), names);
    expect(r.items[0].duplicateOf).toBe('old');
  });

  it('un item sin tienda o persona que ya no existe no rompe nada', () => {
    const r = describeCapture(result([item({ id: 'a', type: 'compra', storeId: 'borrada' }), item({ id: 'g', type: 'regalo', personId: 'borrada' })]), names);
    expect(r.lines).toEqual(['1 compra', 'Regalo sin persona']);
  });

  it('sin nada guardado no hay líneas', () => {
    expect(describeCapture(result([]), names).lines).toEqual([]);
  });
});
