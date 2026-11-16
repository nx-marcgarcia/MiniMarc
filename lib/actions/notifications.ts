/**
 * Ajustes → "Avisos": the channels (Web Push, Telegram), the three reminder hours and whether
 * holidays are skipped. Validation lives here (pure, tested with a fake repo); the server action is a thin wrapper.
 */
import { z } from 'zod';
import type { SettingsRepo } from '@/lib/db/settings';
import { cleanTimes } from '@/lib/db/settings';
import { WINDOW_END_HOUR, WINDOW_START_HOUR } from '@/lib/resurfacing/window';
import { UserError } from './result';

export const MAX_REMINDERS = 5;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const inputSchema = z.object({
  notifyPush: z.boolean().optional(),
  notifyTelegram: z.boolean().optional(),
  skipHolidays: z.boolean().optional(),
  reminderTimes: z.array(z.string()).optional(),
});

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

export async function updateNotifications(repo: SettingsRepo, input: unknown): Promise<void> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new UserError('Esos ajustes no son válidos.');
  const { notifyPush, notifyTelegram, skipHolidays, reminderTimes } = parsed.data;

  const patch: Parameters<SettingsRepo['update']>[0] = {};
  if (notifyPush !== undefined) patch.notifyPush = notifyPush;
  if (notifyTelegram !== undefined) patch.notifyTelegram = notifyTelegram;
  if (skipHolidays !== undefined) patch.skipHolidays = skipHolidays;

  if (reminderTimes !== undefined) {
    if (reminderTimes.length === 0) throw new UserError('Deja al menos una hora.');
    if (reminderTimes.length > MAX_REMINDERS) throw new UserError(`Como mucho ${MAX_REMINDERS} recordatorios al día.`);
    for (const t of reminderTimes) {
      const m = HHMM.exec(t.trim());
      if (!m) throw new UserError('Escribe las horas como 11:00.');
      const hour = Number(m[1]);
      if (hour < WINDOW_START_HOUR || hour >= WINDOW_END_HOUR) {
        throw new UserError(`Los recordatorios van entre las ${pad(WINDOW_START_HOUR)} y las ${pad(WINDOW_END_HOUR)}.`);
      }
    }
    patch.reminderTimes = cleanTimes(reminderTimes);
  }

  if (Object.keys(patch).length === 0) throw new UserError('No hay nada que guardar.');
  await repo.update(patch);
}
