import { describe, expect, it } from 'vitest';
import type { ResurfacingEvent } from '@/lib/db/resurfacing';
import { timedDue } from '@/lib/resurfacing/timed';
import { madridToUtc } from '@/lib/time';
import { makeItem } from '../screens/setup';

const tarea = (id: string, date: string, time: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'tarea', title: `Tarea ${id}`, status: 'pendiente', area: 'personal', dueAt: madridToUtc(date, time).toISOString(), hasTime: true, ...over });
const sentEvent = (subject: string): ResurfacingEvent => ({ id: subject, itemId: null, subject, kind: 'con_hora', channel: 'telegram', sentAt: '2026-11-21T09:00:00.000Z', action: null, actedAt: null, telegramMessageId: null });

describe('timedDue: tareas con hora exacta', () => {
  it('«llamar el sábado a las 11» avisa a esa hora aunque sea fin de semana', () => {
    const now = madridToUtc('2026-11-21', '11:00'); // sábado
    const [c] = timedDue({ now, tz: 'Europe/Madrid', items: [tarea('a', '2026-11-21', '11:00')], sent: [] });
    expect(c).toMatchObject({ kind: 'con_hora', subject: expect.stringMatching(/^timed:a:/), itemId: 'a', urgent: true, title: 'Tarea a' });
    expect(c.detail).toBe('Ahora, a las 11:00');
  });

  it('cada instante cae en una sola pasada del cron (cada 30 min): ni dos veces ni ninguna', () => {
    const items = [tarea('a', '2026-11-21', '11:10')];
    const hits = ['10:00', '10:30', '11:00', '11:30', '12:00'].filter((t) => timedDue({ now: madridToUtc('2026-11-21', t), tz: 'Europe/Madrid', items, sent: [] }).length > 0);
    // La de las 11:10 la recoge la pasada de las 11:00 (10 minutos antes) y ninguna otra de las :00 y :30.
    expect(hits).toEqual(['11:00']);
    const later = [tarea('b', '2026-11-21', '11:20')];
    expect(['10:30', '11:00', '11:30', '12:00'].filter((t) => timedDue({ now: madridToUtc('2026-11-21', t), tz: 'Europe/Madrid', items: later, sent: [] }).length > 0)).toEqual(['11:30']);
  });

  it('una tarea en espera no avisa «Ahora» aunque tenga hora', () => {
    const now = madridToUtc('2026-11-21', '11:00');
    expect(timedDue({ now, tz: 'Europe/Madrid', items: [tarea('a', '2026-11-21', '11:00', { status: 'en_espera' })], sent: [] })).toEqual([]);
  });

  it('no repite lo que ya avisó', () => {
    const items = [tarea('a', '2026-11-21', '11:00')];
    const now = madridToUtc('2026-11-21', '11:00');
    const [c] = timedDue({ now, tz: 'Europe/Madrid', items, sent: [] });
    expect(timedDue({ now, tz: 'Europe/Madrid', items, sent: [sentEvent(c.subject)] })).toEqual([]);
  });

  it('si la tarea cambia de hora, avisa otra vez a la nueva', () => {
    const now = madridToUtc('2026-11-21', '12:00');
    const old = timedDue({ now: madridToUtc('2026-11-21', '11:00'), tz: 'Europe/Madrid', items: [tarea('a', '2026-11-21', '11:00')], sent: [] })[0];
    expect(timedDue({ now, tz: 'Europe/Madrid', items: [tarea('a', '2026-11-21', '12:00')], sent: [sentEvent(old.subject)] })).toHaveLength(1);
  });

  it('una tarea sin hora, hecha, de Trabajo o pospuesta no avisa', () => {
    const now = madridToUtc('2026-11-21', '11:00');
    const items = [
      tarea('sin', '2026-11-21', '11:00', { hasTime: false }),
      tarea('hecha', '2026-11-21', '11:00', { status: 'hecha' }),
      tarea('trabajo', '2026-11-21', '11:00', { area: 'trabajo' }),
      tarea('pospuesta', '2026-11-21', '11:00', { snoozedUntil: '2026-11-28T00:00:00.000Z' }),
    ];
    expect(timedDue({ now, tz: 'Europe/Madrid', items, sent: [] })).toEqual([]);
  });

  it('un recordatorio puesto a mano (remindAt) también avisa a su hora, sea del tipo que sea', () => {
    const now = madridToUtc('2026-11-17', '13:30');
    const idea = makeItem({ id: 'r', type: 'idea', title: 'Pensar en el logo', status: 'semilla', area: null, remindAt: madridToUtc('2026-11-17', '13:30').toISOString() });
    const [c] = timedDue({ now, tz: 'Europe/Madrid', items: [idea], sent: [] });
    expect(c).toMatchObject({ kind: 'con_hora', itemId: 'r', detail: 'Recordatorio, a las 13:30' });
  });
});
