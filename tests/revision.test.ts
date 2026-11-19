import { describe, expect, it } from 'vitest';
import { makeProject } from './projectsDoubles';
import { buildReview, looksLikeLooseAction, reviewDue } from '@/lib/revision';
import { makeItem } from './screens/setup';

const TZ = 'Europe/Madrid';
/** Monday 16 Nov 2026, 10:00 in Madrid. */
const MONDAY = new Date('2026-11-16T09:00:00Z');
const TUESDAY = new Date('2026-11-17T09:00:00Z');

describe('buildReview', () => {
  it('cuenta la Bandeja y solo repasa los proyectos activos', () => {
    const r = buildReview({
      items: [makeItem({ id: 'q', needsReview: true }), makeItem({ id: 't', projectId: 'a' })],
      projects: [makeProject({ id: 'a', name: 'Activo' }), makeProject({ id: 'b', name: 'Pausado', status: 'en_pausa' })],
      now: MONDAY,
      tz: TZ,
    });
    expect(r.inbox).toBe(1);
    expect(r.projects.map((p) => p.project.name)).toEqual(['Activo']);
    expect(r.projects[0].nextTask?.id).toBe('t');
  });

  it('atrasado: tareas abiertas de antes de hoy, de las dos áreas; no las de hoy', () => {
    const r = buildReview({
      items: [
        makeItem({ id: 'ayer', dueAt: '2026-11-15T10:00:00Z' }),
        makeItem({ id: 'trabajo', area: 'trabajo', dueAt: '2026-11-10T10:00:00Z' }),
        makeItem({ id: 'hoy', dueAt: '2026-11-16T15:00:00Z' }),
        makeItem({ id: 'hecha', status: 'hecha', dueAt: '2026-11-10T10:00:00Z' }),
      ],
      projects: [],
      now: MONDAY,
      tz: TZ,
    });
    expect(r.overdue.map((i) => i.id)).toEqual(['trabajo', 'ayer']);
  });

  it('rescatar: ideas quietas 30 días y enlaces de más de 2 meses, como mucho 10, lo más antiguo primero', () => {
    const old = (n: number) => new Date(MONDAY.getTime() - n * 86_400_000).toISOString();
    const items = [
      makeItem({ id: 'idea-vieja', type: 'idea', status: 'semilla', updatedAt: old(40), createdAt: old(40) }),
      makeItem({ id: 'idea-nueva', type: 'idea', status: 'semilla', updatedAt: old(5), createdAt: old(5) }),
      makeItem({ id: 'enlace-viejo', type: 'enlace', status: 'por_ver', createdAt: old(90), updatedAt: old(90) }),
      ...Array.from({ length: 12 }, (_, n) => makeItem({ id: `e${n}`, type: 'enlace', status: 'por_ver', createdAt: old(61 + n), updatedAt: old(61 + n) })),
    ];
    const r = buildReview({ items, projects: [], now: MONDAY, tz: TZ });
    expect(r.rescue).toHaveLength(10);
    expect(r.rescue[0].id).toBe('enlace-viejo');
    expect(r.rescue.some((i) => i.id === 'idea-nueva')).toBe(false);
  });

  it('la semana que viene empieza el lunes siguiente', () => {
    expect(buildReview({ items: [], projects: [], now: TUESDAY, tz: TZ }).nextWeekStart).toBe('2026-11-23');
  });
});

describe('reviewDue', () => {
  it('los lunes, si nunca se hizo o hace más de 6 días', () => {
    expect(reviewDue(null, MONDAY, TZ)).toBe(true);
    expect(reviewDue('2026-11-13T10:00:00Z', MONDAY, TZ)).toBe(false);
    expect(reviewDue('2026-11-08T10:00:00Z', MONDAY, TZ)).toBe(true);
    expect(reviewDue(null, TUESDAY, TZ)).toBe(false);
  });
});

describe('seguimientos', () => {
  const w = (id: string, over = {}) => makeItem({ id, type: 'tarea', status: 'en_espera', area: 'personal', hasTime: false, data: {}, ...over });

  it('sale la tarea en espera a la que ya toca mirar; no la que aún no, ni cuenta como atrasada', () => {
    const r = buildReview({
      items: [
        w('a', { dueAt: '2026-11-01T10:00:00Z', data: { reviewOn: '2026-11-16' } }),
        w('b', { data: { reviewOn: '2026-11-20' } }),
        w('c', { data: { waitingSince: '2026-11-01' } }),
      ],
      projects: [],
      now: MONDAY,
      tz: TZ,
    });
    expect(r.followUps.map((i) => i.id)).toEqual(['c', 'a']);
    expect(r.overdue).toEqual([]);
  });
});

describe('atrasado por fecha límite', () => {
  const t = (id: string, over = {}) => makeItem({ id, type: 'tarea', status: 'pendiente', area: 'personal', hasTime: false, data: {}, ...over });

  it('una tarea con fecha prevista futura pero límite pasado está atrasada; una con límite futuro no', () => {
    const r = buildReview({
      items: [
        t('a', { dueAt: '2026-11-20T10:00:00Z', data: { deadline: '2026-11-15' } }),
        t('b', { dueAt: '2026-11-20T10:00:00Z', data: { deadline: '2026-11-25' } }),
        t('c', { dueAt: null, data: { deadline: '2026-11-10' } }),
        t('d', { dueAt: '2026-11-12T10:00:00Z' }),
      ],
      projects: [],
      now: MONDAY,
      tz: TZ,
    });
    // Oldest first, by planned date or else by deadline.
    expect(r.overdue.map((i) => i.id)).toEqual(['c', 'd', 'a']);
  });
});

describe('datos por ordenar', () => {
  const idea = (over = {}) => makeItem({ type: 'idea', status: 'semilla', area: null, data: {}, ...over });

  it('una idea corta que empieza por verbo y sin nada más suena a tarea', () => {
    expect(looksLikeLooseAction(idea({ title: 'Trabajar' }))).toBe(true);
    expect(looksLikeLooseAction(idea({ title: 'Llamar al médico' }))).toBe(true);
    expect(looksLikeLooseAction(idea({ title: 'comprar pan' }))).toBe(true);
  });

  it('no si tiene notas, enlace, campos de idea, proyecto, o es larga o no empieza por verbo', () => {
    expect(looksLikeLooseAction(idea({ title: 'Trabajar', notes: 'algo' }))).toBe(false);
    expect(looksLikeLooseAction(idea({ title: 'Trabajar', link: 'https://x.es' }))).toBe(false);
    expect(looksLikeLooseAction(idea({ title: 'Trabajar', data: { nextStep: 'Probar' } }))).toBe(false);
    expect(looksLikeLooseAction(idea({ title: 'Trabajar', projectId: 'p1' }))).toBe(false);
    expect(looksLikeLooseAction(idea({ title: 'Llamar al médico mañana por la tarde' }))).toBe(false);
    expect(looksLikeLooseAction(idea({ title: 'Blog de viajes' }))).toBe(false);
    expect(looksLikeLooseAction(idea({ title: 'Trabajar', status: 'explorando' }))).toBe(false);
    expect(looksLikeLooseAction(makeItem({ title: 'Trabajar' }))).toBe(false);
  });

  it('buildReview junta las ideas sueltas (de las dos áreas, sin las de la Bandeja) y cuenta las compras sin tienda', () => {
    const r = buildReview({
      items: [
        idea({ id: 'a', title: 'Trabajar' }),
        idea({ id: 'b', title: 'Estudiar', area: 'trabajo' }),
        idea({ id: 'c', title: 'Dormir', needsReview: true }),
        makeItem({ id: 'k1', type: 'compra', status: 'quiero', area: null, storeId: null, data: {} }),
        makeItem({ id: 'k2', type: 'compra', status: 'quiero', area: null, storeId: 's1', data: {} }),
        makeItem({ id: 'k3', type: 'compra', status: 'comprado', area: null, storeId: null, data: {} }),
        makeItem({ id: 'k4', type: 'compra', status: 'quiero', area: null, storeId: null, archived: true, data: {} }),
      ],
      projects: [],
      now: MONDAY,
      tz: TZ,
    });
    expect(r.tidy.looseIdeas.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(r.tidy.noStore).toBe(1);
  });
});
