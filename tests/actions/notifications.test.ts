import { describe, expect, it } from 'vitest';
import { UserError } from '@/lib/actions/result';
import { updateNotifications } from '@/lib/actions/notifications';
import type { Settings, SettingsRepo } from '@/lib/db/settings';

function repo() {
  const updates: Partial<Settings>[] = [];
  const r: SettingsRepo = { get: async () => ({}) as Settings, update: async (p) => void updates.push(p) };
  return { r, updates };
}

describe('updateNotifications', () => {
  it('guarda los canales y festivos que se mandan, y nada más', async () => {
    const { r, updates } = repo();
    await updateNotifications(r, { notifyTelegram: false });
    await updateNotifications(r, { notifyPush: true, skipHolidays: false });
    expect(updates).toEqual([{ notifyTelegram: false }, { notifyPush: true, skipHolidays: false }]);
  });

  it('guarda las horas ordenadas, sin repetidas y con dos cifras', async () => {
    const { r, updates } = repo();
    await updateNotifications(r, { reminderTimes: ['15:30', '9:30', '11:00', '11:00'] });
    expect(updates).toEqual([{ reminderTimes: ['09:30', '11:00', '15:30'] }]);
  });

  it('las horas van dentro de la ventana de 9:00 a 16:00', async () => {
    const { r, updates } = repo();
    for (const bad of [['08:59'], ['16:00'], ['23:30'], ['00:00'], ['11:00', '17:15']]) {
      await expect(updateNotifications(r, { reminderTimes: bad })).rejects.toThrow(/entre las 09:00 y las 16:00/);
    }
    expect(updates).toEqual([]);
  });

  it('hora mal escrita, vacía o demasiadas → error claro', async () => {
    const { r } = repo();
    await expect(updateNotifications(r, { reminderTimes: ['mediodía'] })).rejects.toThrow(UserError);
    await expect(updateNotifications(r, { reminderTimes: [] })).rejects.toThrow(/al menos una hora/);
    await expect(updateNotifications(r, { reminderTimes: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'] })).rejects.toThrow(/Como mucho 5/);
  });

  it('basura o un objeto vacío no guardan nada', async () => {
    const { r, updates } = repo();
    await expect(updateNotifications(r, null)).rejects.toThrow(UserError);
    await expect(updateNotifications(r, { notifyPush: 'sí' })).rejects.toThrow(UserError);
    await expect(updateNotifications(r, {})).rejects.toThrow(UserError);
    expect(updates).toEqual([]);
  });

  it('ignora claves que no son de aquí (no se cuela lastSlot ni nada)', async () => {
    const { r, updates } = repo();
    await updateNotifications(r, { notifyPush: false, lastSlot: '2000-01-01 09:00', digestHour: 3 });
    expect(updates).toEqual([{ notifyPush: false }]);
  });
});
