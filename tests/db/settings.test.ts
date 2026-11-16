import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSettingsRepo } from '@/lib/db/settings';

/** Minimal client: select(cols).eq().maybeSingle(), answering per column list. */
function fakeClient(answer: (cols: string) => { data: unknown; error: { code?: string; message: string } | null }) {
  const selects: string[] = [];
  const client = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return { eq: () => ({ maybeSingle: async () => answer(cols) }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, selects };
}

const base = { digest_hour: 7, tz: 'Europe/Madrid', last_digest_date: null, last_digest_headline: null, last_digest_headline_date: null };

describe('createSettingsRepo · resumen semanal', () => {
  it('lee el resumen semanal y su última semana', async () => {
    const { client } = fakeClient(() => ({
      data: { ...base, weekly_digest: 'domingo', last_weekly_date: '2026-10-26', last_week_headline: 'x', last_week_headline_week: '2026-10-26' },
      error: null,
    }));
    expect(await createSettingsRepo(client, 'u').get()).toMatchObject({
      digestHour: 7,
      weeklyDigest: 'domingo',
      lastWeeklyDate: '2026-10-26',
      weekHeadline: 'x',
      weekHeadlineWeek: '2026-10-26',
    });
  });

  it('sin 0007 aplicada (columna inexistente): lo demás funciona y el semanal queda desactivado', async () => {
    const { client, selects } = fakeClient((cols) =>
      cols.includes('weekly_digest')
        ? { data: null, error: { code: '42703', message: 'column settings.weekly_digest does not exist' } }
        : { data: base, error: null },
    );
    const s = await createSettingsRepo(client, 'u').get();
    expect(s).toMatchObject({ digestHour: 7, weeklyDigest: 'off', lastWeeklyDate: null });
    // Tries with everything, without 0013, and finally without 0007.
    expect(selects).toHaveLength(3);
  });
});

describe('createSettingsRepo · avisos (0013)', () => {
  const v13 = { notify_push: false, notify_telegram: true, reminder_times: ['10:30', '14:00'], skip_holidays: false, last_slot: '2026-11-17 11:00' };

  it('lee los canales, las horas de los recordatorios, festivos y la última franja', async () => {
    const { client } = fakeClient(() => ({ data: { ...base, weekly_digest: 'lunes', ...v13 }, error: null }));
    expect(await createSettingsRepo(client, 'u').get()).toMatchObject({
      notifyPush: false,
      notifyTelegram: true,
      reminderTimes: ['10:30', '14:00'],
      skipHolidays: false,
      lastSlot: '2026-11-17 11:00',
    });
  });

  it('descarta horas mal escritas y ordena las buenas; sin ninguna válida vuelve a las de siempre', async () => {
    const read = async (times: unknown) => {
      const { client } = fakeClient(() => ({ data: { ...base, weekly_digest: 'lunes', ...v13, reminder_times: times }, error: null }));
      return (await createSettingsRepo(client, 'u').get()).reminderTimes;
    };
    expect(await read(['15:30', '25:00', 'tarde', '9:05', '11:00'])).toEqual(['09:05', '11:00', '15:30']);
    expect(await read([])).toEqual(['11:00', '13:30', '15:30']);
    expect(await read(null)).toEqual(['11:00', '13:30', '15:30']);
  });

  it('sin 0013 aplicada: no se envía ningún recordatorio (no habría dónde apuntar lo enviado) y lo demás sigue', async () => {
    const { client, selects } = fakeClient((cols) =>
      cols.includes('last_slot')
        ? { data: null, error: { code: '42703', message: 'column settings.last_slot does not exist' } }
        : { data: { ...base, weekly_digest: 'lunes' }, error: null },
    );
    const s = await createSettingsRepo(client, 'u').get();
    expect(s).toMatchObject({ digestHour: 7, weeklyDigest: 'lunes', reminderTimes: [], notifyTelegram: false, notifyPush: true, lastSlot: null });
    expect(selects).toHaveLength(2);
  });

  it('actualiza con los nombres de columna de la base', async () => {
    const updates: unknown[] = [];
    const client = { from: () => ({ update: (row: unknown) => (updates.push(row), { eq: async () => ({ error: null }) }) }) } as unknown as SupabaseClient;
    await createSettingsRepo(client, 'u').update({ notifyTelegram: false, reminderTimes: ['10:00'], skipHolidays: true, lastSlot: '2026-11-17 10:00' });
    expect(updates).toEqual([{ notify_telegram: false, reminder_times: ['10:00'], skip_holidays: true, last_slot: '2026-11-17 10:00' }]);
  });
});
