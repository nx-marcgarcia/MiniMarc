import { describe, expect, it } from 'vitest';
import { shouldSendWeekly } from '@/lib/cron/shouldSendWeekly';
import type { WeeklyDigest } from '@/lib/db/settings';
import { madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
const s = (weeklyDigest: WeeklyDigest, lastWeeklyDate: string | null = null, extra: { digestHour?: number; skipHolidays?: boolean } = {}) => ({
  weeklyDigest,
  tz: TZ,
  lastWeeklyDate,
  digestHour: 9,
  skipHolidays: true,
  ...extra,
});
const at = (date: string, time: string) => madridToUtc(date, time);

describe('shouldSendWeekly: el resumen de la semana sale dentro de la ventana L-V 9-16', () => {
  it('el lunes desde las 9:00 resume esa semana', () => {
    expect(shouldSendWeekly(at('2026-11-16', '09:00'), s('lunes', '2026-11-09'))).toBe('2026-11-16');
    expect(shouldSendWeekly(at('2026-11-16', '09:00'), s('lunes'))).toBe('2026-11-16');
  });

  it('el lunes antes de las 9:00 no; si la pasada de las 9:00 falló, una posterior del lunes lo recupera', () => {
    expect(shouldSendWeekly(at('2026-11-16', '08:30'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(at('2026-11-16', '12:00'), s('lunes'))).toBe('2026-11-16');
    expect(shouldSendWeekly(at('2026-11-16', '16:00'), s('lunes'))).toBeNull();
  });

  it('esa semana ya enviada → nada, ni el resto del lunes', () => {
    expect(shouldSendWeekly(at('2026-11-16', '09:00'), s('lunes', '2026-11-16'))).toBeNull();
    expect(shouldSendWeekly(at('2026-11-16', '15:00'), s('lunes', '2026-11-16'))).toBeNull();
  });

  it('otro día de la semana → nada (no se recupera el miércoles)', () => {
    expect(shouldSendWeekly(at('2026-11-17', '09:00'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(at('2026-11-18', '10:00'), s('lunes'))).toBeNull();
  });

  it('un lunes festivo pasa al primer día hábil de esa semana (martes)', () => {
    // Lunes 12 oct 2026 es la Fiesta Nacional.
    expect(shouldSendWeekly(at('2026-10-12', '09:00'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(at('2026-10-13', '09:00'), s('lunes'))).toBe('2026-10-12');
    expect(shouldSendWeekly(at('2026-10-14', '09:00'), s('lunes'))).toBeNull();
  });

  it('el domingo a las 20:00 queda fuera de la ventana: la opción «domingo» sale el lunes', () => {
    expect(shouldSendWeekly(at('2026-11-15', '20:00'), s('domingo'))).toBeNull();
    expect(shouldSendWeekly(at('2026-11-16', '09:00'), s('domingo'))).toBe('2026-11-16');
  });

  it('el lunes del cambio de hora (26 oct) y el del cambio a verano (30 mar) salen a las 9:00 locales', () => {
    expect(shouldSendWeekly(new Date('2026-10-26T07:30:00Z'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-10-26T08:00:00Z'), s('lunes'))).toBe('2026-10-26');
    expect(shouldSendWeekly(new Date('2026-03-30T06:30:00Z'), s('lunes'))).toBeNull();
    expect(shouldSendWeekly(new Date('2026-03-30T07:00:00Z'), s('lunes'))).toBe('2026-03-30');
  });

  it('con la hora del briefing más tarde, espera a esa hora', () => {
    expect(shouldSendWeekly(at('2026-11-16', '10:00'), s('lunes', null, { digestHour: 11 }))).toBeNull();
    expect(shouldSendWeekly(at('2026-11-16', '11:00'), s('lunes', null, { digestHour: 11 }))).toBe('2026-11-16');
  });

  it('desactivado → nunca', () => {
    expect(shouldSendWeekly(at('2026-11-16', '09:00'), s('off'))).toBeNull();
  });
});
