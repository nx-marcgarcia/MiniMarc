import { describe, expect, it } from 'vitest';
import type { DigestEvent, DigestTask } from '@/lib/digest/build';
import type { Item } from '@/lib/db/types';
import { buildDayTimeline } from '@/lib/hoy/timeline';
import { madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
const DATE = '2026-10-22';
const at = (time: string, date = DATE) => madridToUtc(date, time, TZ).toISOString();
const dayEndsAt = madridToUtc('2026-10-23', '00:00', TZ);

function task(id: string, opts: { time?: string; date?: string; overdue?: boolean; calendarEventId?: string } = {}): DigestTask {
  const item = {
    id,
    type: 'tarea',
    title: id,
    dueAt: at(opts.time ?? '00:00', opts.date),
    hasTime: Boolean(opts.time),
    calendarEventId: opts.calendarEventId ?? null,
    area: null,
  } as unknown as Item;
  return { item, overdue: opts.overdue ?? false };
}

const event = (id: string, start: string, end: string, date = DATE): DigestEvent => ({
  id,
  title: id,
  startsAt: at(start, date),
  endsAt: at(end, date),
});

describe('buildDayTimeline', () => {
  it('mezcla citas y tareas con hora por orden de hora', () => {
    const t = buildDayTimeline({
      events: [event('c10', '10:00', '11:00'), event('c12', '12:00', '13:00')],
      tasks: [task('t930', { time: '09:30' })],
      tz: TZ,
      dayEndsAt,
    });
    expect(t.timed.map((e) => e.time)).toEqual(['09:30', '10:00', '12:00']);
    expect(t.timed.map((e) => e.kind)).toEqual(['task', 'event', 'event']);
  });

  it('una tarea con hora no sale dos veces', () => {
    const t = buildDayTimeline({
      events: [event('ev1', '09:30', '10:00')],
      tasks: [task('t', { time: '09:30', calendarEventId: 'ev1' })],
      tz: TZ,
      dayEndsAt,
    });
    expect(t.timed).toHaveLength(1);
    expect(t.timed[0].kind).toBe('task');
  });

  it('las citas de todo el día van aparte', () => {
    const t = buildDayTimeline({ events: [event('fiesta', '00:00', '00:00', DATE)].map((e) => ({ ...e, endsAt: at('00:00', '2026-10-23') })), tasks: [], tz: TZ, dayEndsAt });
    expect(t.allDay.map((e) => e.id)).toEqual(['fiesta']);
    expect(t.timed).toEqual([]);
  });

  it('sin hora y atrasadas van en untimed, atrasadas primero', () => {
    const t = buildDayTimeline({
      events: [],
      tasks: [task('hoy'), task('ayer', { time: '18:00', date: '2026-10-21', overdue: true })],
      tz: TZ,
      dayEndsAt,
    });
    expect(t.untimed.map((x) => x.item.id)).toEqual(['ayer', 'hoy']);
    expect(t.timed).toEqual([]);
  });
});
