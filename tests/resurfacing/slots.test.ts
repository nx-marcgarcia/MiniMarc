import { describe, expect, it } from 'vitest';
import { briefingHour, dueReminderSlot, reminderSlots, type SlotSettings } from '@/lib/resurfacing/slots';
import { madridToUtc } from '@/lib/time';

const settings = (over: Partial<SlotSettings> = {}): SlotSettings => ({
  tz: 'Europe/Madrid',
  digestHour: 9,
  reminderTimes: ['11:00', '13:30', '15:30'],
  skipHolidays: true,
  lastSlot: null,
  ...over,
});
const at = (date: string, time: string) => madridToUtc(date, time);

describe('briefingHour', () => {
  it('el briefing sale a las 9:00 como pronto, aunque el ajuste antiguo fuera más temprano', () => {
    expect(briefingHour({ digestHour: 8 })).toBe(9);
    expect(briefingHour({ digestHour: 9 })).toBe(9);
    expect(briefingHour({ digestHour: 11 })).toBe(11);
  });
});

describe('reminderSlots', () => {
  it('las franjas del día, con su fecha, dentro de 9:00-16:00', () => {
    expect(reminderSlots('2026-11-17', settings())).toEqual(['2026-11-17 11:00', '2026-11-17 13:30', '2026-11-17 15:30']);
  });

  it('descarta las horas fuera de la ventana y la que coincide con el briefing', () => {
    expect(reminderSlots('2026-11-17', settings({ reminderTimes: ['08:00', '09:00', '10:00', '16:00', '20:00'] }))).toEqual(['2026-11-17 10:00']);
  });
});

describe('dueReminderSlot', () => {
  it('antes de la primera franja no toca nada', () => {
    expect(dueReminderSlot(at('2026-11-17', '10:59'), settings())).toBeNull();
  });

  it('a la hora de la franja (el cron de las :00 o :30) toca esa', () => {
    expect(dueReminderSlot(at('2026-11-17', '11:00'), settings())).toBe('2026-11-17 11:00');
    expect(dueReminderSlot(at('2026-11-17', '13:30'), settings())).toBe('2026-11-17 13:30');
  });

  it('una franja ya enviada no se repite: si el cron corre dos veces, no envía dos veces', () => {
    expect(dueReminderSlot(at('2026-11-17', '11:30'), settings({ lastSlot: '2026-11-17 11:00' }))).toBeNull();
  });

  it('si el cron falló un rato, se envía la franja atrasada una sola vez (no un aluvión)', () => {
    // Son las 15:30 y no se envió ni la de las 11:00 ni la de las 13:30.
    expect(dueReminderSlot(at('2026-11-17', '15:30'), settings())).toBe('2026-11-17 15:30');
  });

  it('el último envío de ayer no bloquea las de hoy', () => {
    expect(dueReminderSlot(at('2026-11-18', '11:00'), settings({ lastSlot: '2026-11-17 15:30' }))).toBe('2026-11-18 11:00');
  });

  it('fuera de la ventana no se envía nada: sábado, tras las 16:00 o festivo', () => {
    expect(dueReminderSlot(at('2026-11-21', '11:00'), settings())).toBeNull();
    expect(dueReminderSlot(at('2026-11-17', '16:00'), settings())).toBeNull();
    expect(dueReminderSlot(at('2026-12-08', '11:00'), settings())).toBeNull(); // Inmaculada
    expect(dueReminderSlot(at('2026-12-08', '11:00'), settings({ skipHolidays: false }))).toBe('2026-12-08 11:00');
  });

  it('el lunes el fin de semana no ha dejado nada colgado: la primera franja del lunes es la normal', () => {
    expect(dueReminderSlot(at('2026-11-23', '11:00'), settings({ lastSlot: '2026-11-20 15:30' }))).toBe('2026-11-23 11:00');
  });

  it('con el cambio de hora la franja sigue siendo la hora de Madrid', () => {
    expect(dueReminderSlot(at('2026-10-26', '11:00'), settings())).toBe('2026-10-26 11:00');
    expect(dueReminderSlot(at('2026-07-14', '11:00'), settings())).toBe('2026-07-14 11:00');
  });
});
