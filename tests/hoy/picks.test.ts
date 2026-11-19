import { describe, expect, it } from 'vitest';
import { CALM_HEADLINE } from '@/lib/digest/build';
import { CHOICES_MAX, CHOOSE_HEADLINE, estimateOf, headlineFor, hoyPicks, QUICK_MAX } from '@/lib/hoy/picks';
import { makeItem } from '../screens/setup';

const TODAY = '2026-11-17';
const at = (date: string) => `${date}T10:00:00.000Z`;
const t = (id: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'tarea', title: `Tarea ${id}`, status: 'pendiente', area: 'personal', dueAt: null, hasTime: false, data: {}, createdAt: `2026-10-${String(10 + id.charCodeAt(0) - 96).padStart(2, '0')}T10:00:00.000Z`, ...over });
const pick = (items: ReturnType<typeof t>[], area: 'personal' | 'trabajo' | 'todo' = 'todo') => hoyPicks({ items, today: TODAY, area });

describe('mi prioridad de hoy', () => {
  it('es la tarea abierta marcada para hoy; la de otro día no cuenta', () => {
    expect(pick([t('a', { data: { focusOn: TODAY } }), t('b')]).priority?.id).toBe('a');
    expect(pick([t('a', { data: { focusOn: '2026-11-16' } })]).priority).toBeNull();
  });

  it('una tarea hecha, en espera o en la Bandeja no puede ser la prioridad', () => {
    const data = { focusOn: TODAY };
    expect(pick([t('a', { data, status: 'hecha' }), t('b', { data, status: 'en_espera' }), t('c', { data, needsReview: true })]).priority).toBeNull();
  });

  it('se ve aunque el filtro de área sea otro, y no se repite en las listas de elegir', () => {
    const p = pick([t('a', { area: 'trabajo', data: { focusOn: TODAY } }), t('b')], 'personal');
    expect(p.priority?.id).toBe('a');
    expect(p.choices.map((i) => i.id)).toEqual(['b']);
  });
});

describe('si tienes 15 minutos', () => {
  it('solo tareas con duración de 15 min o menos, las atrasadas primero y luego las más cortas', () => {
    const p = pick([
      t('a', { data: { estimateMin: 10 } }),
      t('b', { data: { estimateMin: 5 } }),
      t('c', { data: { estimateMin: 45 } }),
      t('d'),
      t('e', { data: { estimateMin: 15 }, dueAt: at('2026-11-10') }),
    ]);
    expect(p.quick.map((i) => i.id)).toEqual(['e', 'b', 'a']);
  });

  it('como mucho tres, y ninguna si ninguna tiene duración (no se inventa)', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => t(id, { data: { estimateMin: 5 } }));
    expect(pick(many).quick).toHaveLength(QUICK_MAX);
    expect(pick([t('a'), t('b')]).quick).toEqual([]);
  });

  it('respeta el filtro de área', () => {
    const items = [t('a', { data: { estimateMin: 5 } }), t('b', { area: 'trabajo', data: { estimateMin: 5 } })];
    expect(pick(items, 'personal').quick.map((i) => i.id)).toEqual(['a']);
    expect(pick(items, 'trabajo').quick.map((i) => i.id)).toEqual(['b']);
    expect(pick(items, 'todo').quick).toHaveLength(2);
  });

  it('estimateOf ignora lo que no es una duración', () => {
    expect(estimateOf({ data: { estimateMin: 20 } })).toBe(20);
    expect(estimateOf({ data: { estimateMin: 0 } })).toBeNull();
    expect(estimateOf({ data: { estimateMin: '20' } })).toBeNull();
    expect(estimateOf({ data: {} })).toBeNull();
  });
});

describe('elegir la prioridad', () => {
  it('atrasadas, luego hoy, luego las demás; sin las que esperan', () => {
    const p = pick([
      t('a'),
      t('b', { dueAt: at('2026-11-17') }),
      t('c', { dueAt: at('2026-11-10') }),
      t('d', { status: 'en_espera' }),
      t('e', { data: { deadline: '2026-11-12' }, dueAt: at('2026-11-25') }),
    ]);
    expect(p.choices.map((i) => i.id)).toEqual(['c', 'e', 'b', 'a']);
  });

  it('como mucho ocho', () => {
    const many = 'abcdefghijkl'.split('').map((id) => t(id));
    expect(pick(many).choices).toHaveLength(CHOICES_MAX);
  });

  it('con nada que hacer, todo vacío', () => {
    expect(pick([])).toEqual({ priority: null, quick: [], choices: [] });
  });
});

describe('headlineFor', () => {
  const withChoices = pick([t('a')]);
  it('«Día tranquilo» pasa a invitar a elegir cuando hay tareas por hacer', () => {
    expect(headlineFor(CALM_HEADLINE, withChoices)).toBe(CHOOSE_HEADLINE);
  });
  it('no cambia si no hay nada que elegir, si ya hay prioridad o si el titular es otro', () => {
    expect(headlineFor(CALM_HEADLINE, pick([]))).toBe(CALM_HEADLINE);
    expect(headlineFor(CALM_HEADLINE, pick([t('a', { data: { focusOn: TODAY } })]))).toBe(CALM_HEADLINE);
    expect(headlineFor('Hoy tienes 2 tareas.', withChoices)).toBe('Hoy tienes 2 tareas.');
  });
});
