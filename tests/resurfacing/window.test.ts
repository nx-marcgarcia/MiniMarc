import { describe, expect, it } from 'vitest';
import { easterSunday, holidaysOf, inWindow, isHoliday, isSendDay, WINDOW_END_HOUR, WINDOW_START_HOUR } from '@/lib/resurfacing/window';
import { madridToUtc } from '@/lib/time';

describe('easterSunday', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
  ])('%i → %s', (year, date) => {
    expect(easterSunday(year)).toBe(date);
  });
});

describe('festivos', () => {
  it('los nacionales de 2026, con Viernes Santo calculado', () => {
    const h = holidaysOf(2026);
    for (const d of ['2026-01-01', '2026-01-06', '2026-04-03', '2026-05-01', '2026-08-15', '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25']) {
      expect(h.has(d), d).toBe(true);
    }
  });

  it('los de la Comunidad Valenciana: San José, Lunes de Pascua, San Juan y el 9 de octubre', () => {
    const h = holidaysOf(2026);
    for (const d of ['2026-03-19', '2026-04-06', '2026-06-24', '2026-10-09']) expect(h.has(d), d).toBe(true);
  });

  it('un día cualquiera no es festivo', () => {
    expect(isHoliday('2026-11-17')).toBe(false);
    expect(isHoliday('2026-12-25')).toBe(true);
  });
});

describe('isSendDay: lunes a viernes, y sin festivos si se pide', () => {
  it('martes sí, sábado y domingo no', () => {
    expect(isSendDay('2026-11-17', { skipHolidays: true })).toBe(true); // martes
    expect(isSendDay('2026-11-21', { skipHolidays: true })).toBe(false); // sábado
    expect(isSendDay('2026-11-22', { skipHolidays: true })).toBe(false); // domingo
  });

  it('un festivo entre semana: no salta con la opción apagada', () => {
    expect(isSendDay('2026-10-12', { skipHolidays: true })).toBe(false); // lunes, Fiesta Nacional
    expect(isSendDay('2026-10-12', { skipHolidays: false })).toBe(true);
  });
});

describe('inWindow: de 9:00 a 16:00 hora de Madrid', () => {
  const at = (date: string, time: string) => madridToUtc(date, time);
  const opts = { skipHolidays: true };

  it('lo marca el reloj de Madrid, no el UTC (verano e invierno)', () => {
    expect(inWindow(at('2026-07-14', '09:00'), opts)).toBe(true); // 07:00 UTC
    expect(inWindow(at('2026-11-17', '09:00'), opts)).toBe(true); // 08:00 UTC
    expect(inWindow(at('2026-07-14', '08:59'), opts)).toBe(false);
  });

  it('las 16:00 ya no entran', () => {
    expect(inWindow(at('2026-11-17', '15:59'), opts)).toBe(true);
    expect(inWindow(at('2026-11-17', '16:00'), opts)).toBe(false);
    expect([WINDOW_START_HOUR, WINDOW_END_HOUR]).toEqual([9, 16]);
  });

  it('un sábado a las 11:00 no', () => {
    expect(inWindow(at('2026-11-21', '11:00'), opts)).toBe(false);
  });

  it('el cambio de hora de octubre no mueve la ventana (25 de octubre, domingo → lunes 26)', () => {
    expect(inWindow(at('2026-10-26', '09:00'), opts)).toBe(true);
    expect(inWindow(at('2026-10-26', '16:00'), opts)).toBe(false);
  });
});
