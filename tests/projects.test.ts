import { describe, expect, it } from 'vitest';
import { projectSummary } from '@/lib/projects';
import { makeItem } from './screens/setup';

describe('projectSummary', () => {
  it('cuenta por tipo solo lo abierto', () => {
    const s = projectSummary([
      makeItem({ id: 'a', type: 'tarea' }),
      makeItem({ id: 'b', type: 'tarea', status: 'hecha' }),
      makeItem({ id: 'c', type: 'compra', status: 'quiero' }),
      makeItem({ id: 'd', type: 'enlace', status: 'por_ver', archived: true }),
    ]);
    expect(s.counts).toEqual({ tarea: 1, compra: 1 });
  });

  it('la siguiente tarea es la de fecha más cercana; sin fechas, la más antigua', () => {
    const later = makeItem({ id: 'l', dueAt: '2026-11-20T10:00:00.000Z' });
    const sooner = makeItem({ id: 's', dueAt: '2026-11-18T10:00:00.000Z' });
    const undated = makeItem({ id: 'u', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(projectSummary([later, undated, sooner]).nextTask?.id).toBe('s');
    const old = makeItem({ id: 'o', createdAt: '2026-01-01T00:00:00.000Z' });
    const recent = makeItem({ id: 'r', createdAt: '2026-06-01T00:00:00.000Z' });
    expect(projectSummary([recent, old]).nextTask?.id).toBe('o');
  });

  it('una tarea en espera no es el siguiente paso; si es la única, el proyecto pide uno', () => {
    const waiting = makeItem({ id: 'w', status: 'en_espera', dueAt: '2026-11-01T10:00:00.000Z' });
    const doable = makeItem({ id: 'd', dueAt: '2026-11-30T10:00:00.000Z' });
    expect(projectSummary([waiting, doable]).nextTask?.id).toBe('d');
    const only = projectSummary([waiting]);
    expect(only.nextTask).toBeNull();
    expect(only.needsNextStep).toBe(true);
  });

  it('sin tareas abiertas pide un siguiente paso', () => {
    const s = projectSummary([makeItem({ type: 'compra', status: 'quiero' }), makeItem({ status: 'hecha' })]);
    expect(s.nextTask).toBeNull();
    expect(s.needsNextStep).toBe(true);
    expect(projectSummary([makeItem()]).needsNextStep).toBe(false);
  });
});
