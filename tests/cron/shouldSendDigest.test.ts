import { describe, expect, it } from 'vitest';
import { shouldSendDigest } from '@/lib/cron/shouldSendDigest';
import { madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
const s = (lastDigestDate: string | null, digestHour = 9, skipHolidays = true) => ({ digestHour, tz: TZ, lastDigestDate, skipHolidays });
const at = (date: string, time: string) => madridToUtc(date, time);

describe('shouldSendDigest: el briefing, de lunes a viernes desde las 9:00', () => {
  it('un martes a las 9:00 de Madrid, sin enviar hoy → true', () => {
    expect(shouldSendDigest(at('2026-11-17', '09:00'), s('2026-11-16'))).toBe(true);
    expect(shouldSendDigest(at('2026-11-17', '09:00'), s(null))).toBe(true);
  });

  it('mismo día ya enviado → false', () => {
    expect(shouldSendDigest(at('2026-11-17', '09:00'), s('2026-11-17'))).toBe(false);
    expect(shouldSendDigest(at('2026-11-17', '12:00'), s('2026-11-17'))).toBe(false);
  });

  it('antes de las 9:00 no, aunque el ajuste antiguo dijera las 8', () => {
    expect(shouldSendDigest(at('2026-11-17', '08:30'), s('2026-11-16', 8))).toBe(false);
    expect(shouldSendDigest(at('2026-11-17', '09:00'), s('2026-11-16', 8))).toBe(true);
  });

  it('respeta una hora de briefing más tarde (11:00)', () => {
    expect(shouldSendDigest(at('2026-11-17', '10:30'), s(null, 11))).toBe(false);
    expect(shouldSendDigest(at('2026-11-17', '11:00'), s(null, 11))).toBe(true);
  });

  it('si la pasada de las 9:00 falló, una posterior dentro de la ventana lo recupera; pasadas las 16:00 ya no', () => {
    expect(shouldSendDigest(at('2026-11-17', '12:30'), s('2026-11-16'))).toBe(true);
    expect(shouldSendDigest(at('2026-11-17', '16:00'), s('2026-11-16'))).toBe(false);
  });

  it('un sábado o un domingo no se envía nada; lo del fin de semana sale el lunes', () => {
    expect(shouldSendDigest(at('2026-11-21', '09:00'), s('2026-11-20'))).toBe(false);
    expect(shouldSendDigest(at('2026-11-22', '10:00'), s('2026-11-20'))).toBe(false);
    expect(shouldSendDigest(at('2026-11-23', '09:00'), s('2026-11-20'))).toBe(true);
  });

  it('un festivo entre semana no se envía (o sí, si se apagó la opción)', () => {
    expect(shouldSendDigest(at('2026-12-08', '09:00'), s('2026-12-07'))).toBe(false); // Inmaculada
    expect(shouldSendDigest(at('2026-12-08', '09:00'), s('2026-12-07', 9, false))).toBe(true);
  });

  it('el lunes siguiente al cambio de hora (26 oct) y el del cambio a verano (30 mar) salen a las 9:00 locales', () => {
    expect(shouldSendDigest(new Date('2026-10-26T07:30:00Z'), s('2026-10-23'))).toBe(false); // 08:30 CET
    expect(shouldSendDigest(new Date('2026-10-26T08:00:00Z'), s('2026-10-23'))).toBe(true); // 09:00 CET
    expect(shouldSendDigest(new Date('2026-03-30T06:30:00Z'), s('2026-03-27'))).toBe(false); // 08:30 CEST
    expect(shouldSendDigest(new Date('2026-03-30T07:00:00Z'), s('2026-03-27'))).toBe(true); // 09:00 CEST
  });
});
