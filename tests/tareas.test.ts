import { describe, expect, it } from 'vitest';
import { groupTareas } from '@/lib/tareas';
import { makeItem } from './screens/setup';

const task = (id: string, dueAt: string | null, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'tarea', title: `Tarea ${id}`, status: 'pendiente', area: 'personal', dueAt, hasTime: false, data: {}, ...over });

const TODAY = '2026-11-16'; // lunes
const at = (date: string, time = '10:00') => `${date}T${time}:00.000Z`;

describe('groupTareas', () => {
  it('reparte por día: atrasadas, hoy, mañana, esta semana, más adelante y sin fecha', () => {
    const groups = groupTareas(
      [
        task('a', at('2026-11-10')),
        task('b', at('2026-11-16')),
        task('c', at('2026-11-17')),
        task('d', at('2026-11-20')),
        task('e', at('2026-12-30')),
        task('f', null),
      ],
      TODAY,
    );
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['atrasadas', ['a']],
      ['hoy', ['b']],
      ['manana', ['c']],
      ['semana', ['d']],
      ['despues', ['e']],
      ['sin-fecha', ['f']],
    ]);
  });

  it('fecha límite: pasada manda a Atrasadas aunque la fecha prevista sea futura; sin fecha prevista agrupa por el límite', () => {
    const groups = groupTareas(
      [
        task('a', at('2026-11-20'), { data: { deadline: '2026-11-15' } }),
        task('b', null, { data: { deadline: '2026-11-17' } }),
        task('c', null, { data: { deadline: '2026-11-16' } }),
        task('d', at('2026-11-17'), { data: { deadline: '2026-11-30' } }),
      ],
      TODAY,
    );
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)]).filter(([, ids]) => (ids as string[]).length)).toEqual([
      ['atrasadas', ['a']],
      ['hoy', ['c']],
      ['manana', ['b', 'd']],
    ]);
  });

  it('una fecha límite inválida se ignora', () => {
    expect(groupTareas([task('a', null, { data: { deadline: 'pronto' } })], TODAY)[5].items.map((i) => i.id)).toEqual(['a']);
  });

  it('devuelve siempre los seis grupos (la pantalla esconde los vacíos) y con su título', () => {
    expect(groupTareas([], TODAY).map((g) => g.header)).toEqual(['Atrasadas', 'Hoy', 'Mañana', 'Esta semana', 'Más adelante', 'Sin fecha']);
  });

  it('el día se cuenta en hora de Madrid, no en UTC (23:30 UTC del 16 ya es el 17 en Madrid)', () => {
    const [, hoy, manana] = groupTareas([task('a', '2026-11-16T23:30:00.000Z', { hasTime: true })], TODAY);
    expect(hoy.items).toHaveLength(0);
    expect(manana.items.map((i) => i.id)).toEqual(['a']);
  });

  it('una tarea de hoy a una hora que ya pasó sigue en hoy, no en atrasadas', () => {
    const [atrasadas, hoy] = groupTareas([task('a', '2026-11-16T05:00:00.000Z', { hasTime: true })], TODAY);
    expect(atrasadas.items).toHaveLength(0);
    expect(hoy.items).toHaveLength(1);
  });

  it('el límite de «esta semana» son 7 días', () => {
    const g = groupTareas([task('a', at('2026-11-23')), task('b', at('2026-11-24'))], TODAY);
    expect(g.find((x) => x.key === 'semana')!.items.map((i) => i.id)).toEqual(['a']);
    expect(g.find((x) => x.key === 'despues')!.items.map((i) => i.id)).toEqual(['b']);
  });

  it('mantiene el orden de entrada dentro de cada grupo', () => {
    const g = groupTareas([task('x', at('2026-11-16', '08:00')), task('y', at('2026-11-16', '09:00'))], TODAY);
    expect(g[1].items.map((i) => i.id)).toEqual(['x', 'y']);
  });
});
