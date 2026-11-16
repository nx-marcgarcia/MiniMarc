/**
 * Criterio de aceptación de la fase 4: «un martes recibo el briefing a las 9:00 y 3 recordatorios
 * dentro de la ventana, un sábado no recibo nada y el lunes a las 9:00 me llega lo pendiente».
 * Se ejecuta el cron real (runMorning) cada 30 minutos durante una semana, con repositorios en
 * memoria y Telegram/push falsos, y se mira qué sale y cuándo (hora de Madrid).
 */
import { describe, expect, it } from 'vitest';
import type { CalendarGateway } from '@/lib/calendar/client';
import { runMorning, type MorningDeps } from '@/lib/cron/morning';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createPhotosRepo } from '@/lib/db/photos';
import { createResurfacingRepo } from '@/lib/db/resurfacing';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import type { Digest } from '@/lib/digest/build';
import { deliverBriefing, runResurfacing, type ResurfaceDeps } from '@/lib/resurfacing/run';
import type { TelegramClient } from '@/lib/telegram/client';
import { madridDateTime, madridToUtc } from '@/lib/time';

const TZ = 'Europe/Madrid';
const DAY = 86_400_000;
const HALF_HOUR = 30 * 60_000;

function world(start: string) {
  let now = madridToUtc(start, '00:00', TZ);
  const clock = () => now;
  const backend = createMemoryBackend({ now: clock });
  const items = createItemsRepo(backend, { now: clock });
  const people = createPeopleRepo(backend);
  const resurfacing = createResurfacingRepo(backend, { now: clock });
  const state: Settings = {
    digestHour: 9, tz: TZ, lastDigestDate: null, headline: null, headlineDate: null, weeklyDigest: 'off', lastWeeklyDate: null, weekHeadline: null, weekHeadlineWeek: null,
    notifyPush: false, notifyTelegram: true, reminderTimes: ['11:00', '13:30', '15:30'], skipHolidays: true, lastSlot: null,
  };
  const settings: SettingsRepo = { get: async () => ({ ...state }), update: async (p) => void Object.assign(state, p) };
  const telegram: { at: string; html: string }[] = [];
  const client: TelegramClient = {
    async sendMessage(m) {
      const { date, time } = madridDateTime(now, TZ);
      telegram.push({ at: `${date} ${time}`, html: m.html });
      return telegram.length;
    },
    async answerCallback() {},
    async editMessage() {},
  };
  const resurface = (): ResurfaceDeps => ({ now, settings, items, people, resurfacing, telegram: { client, chatId: '42' }, appUrl: 'https://app.test', subscriptions: async () => [], sendPush: async () => {} });

  const digestOf = async (date: string): Promise<Digest> => {
    const open = await items.listItems({ open: true });
    const today = madridToUtc(date, '00:00', TZ).getTime();
    const tasks = open.filter((i) => i.type === 'tarea' && i.dueAt && Date.parse(i.dueAt) < today + DAY);
    return {
      date, events: [], calendarError: null, dayTasks: [],
      tasks: { personal: { items: tasks.map((item) => ({ item, overdue: Date.parse(item.dueAt!) < today })), more: 0 }, trabajo: { items: [], more: 0 } },
      unclassified: 0, dates: [], headline: tasks.length ? 'Buenos días' : 'Buenos días. Día tranquilo.',
    };
  };
  const calendar: CalendarGateway = { createEvent: async () => 'e', updateEvent: async () => {}, setRequiredReminders: async () => {}, deleteEvent: async () => {}, listEvents: async () => [], ensureCalendar: async () => 'c' };
  const deps = (): MorningDeps => ({
    now, settings, items, calendar: async () => calendar,
    buildDigest: (date) => digestOf(date),
    buildWeekDigest: async () => { throw new Error('semanal apagado'); },
    subscriptions: async () => [], sendPush: async () => {},
    photos: createPhotosRepo(backend), storage: { remove: async () => {} }, invalidate: () => {},
    resurface: () => runResurfacing(resurface()),
    briefing: (d) => deliverBriefing(resurface(), d),
  });

  /** Runs the cron every 30 minutes from the current instant to `until` (Madrid "YYYY-MM-DD HH:mm"), inclusive. */
  async function runUntil(until: string) {
    while (true) {
      const { date, time } = madridDateTime(now, TZ);
      await runMorning(deps());
      if (`${date} ${time}` >= until) break;
      now = new Date(now.getTime() + HALF_HOUR);
    }
  }
  const at = (date: string, time: string) => void (now = madridToUtc(date, time, TZ));
  return { items, telegram, runUntil, at, backend };
}

const past = (days: number) => new Date(madridToUtc('2026-11-16', '00:00', TZ).getTime() - days * DAY).toISOString();

async function seed(w: ReturnType<typeof world>) {
  await w.items.createItem({ type: 'tarea', title: 'Llamar al seguro', area: 'personal', dueAt: past(2) });
  await w.items.createItem({ type: 'idea', title: 'App de recetas' }, { createdAt: past(45) });
  await w.items.createItem({ type: 'libro', title: 'Dune' }, { createdAt: past(90) });
  await w.items.createItem({ type: 'enlace', title: 'Vídeo de cocina' }, { createdAt: past(100) });
}

describe('criterio de aceptación de la fase 4', () => {
  it('un martes: el briefing a las 9:00 y 3 recordatorios dentro de la ventana, ni uno más', async () => {
    const w = world('2026-11-17'); // martes
    await seed(w);
    await w.runUntil('2026-11-17 23:30');
    const times = w.telegram.map((m) => m.at.slice(11));
    expect(times).toEqual(['09:00', '11:00', '13:30', '15:30']);
    expect(w.telegram[0].html).toContain('Hoy: 1 tarea (1 atrasada)');
    // Cada recordatorio es una cosa distinta.
    const reminders = w.telegram.slice(1).map((m) => m.html.match(/«([^»]+)»/)?.[1]);
    expect(new Set(reminders).size).toBe(3);
  });

  it('un sábado no llega nada, y un domingo tampoco', async () => {
    const w = world('2026-11-21'); // sábado
    await seed(w);
    await w.runUntil('2026-11-22 23:30');
    expect(w.telegram).toEqual([]);
  });

  it('el lunes a las 9:00 llega lo pendiente de todo el fin de semana', async () => {
    const w = world('2026-11-20'); // viernes
    await seed(w);
    await w.runUntil('2026-11-23 09:00'); // viernes → lunes 9:00, con fin de semana en medio
    const weekend = w.telegram.filter((m) => m.at >= '2026-11-20 16:00' && m.at < '2026-11-23 09:00');
    expect(weekend).toEqual([]);
    const monday = w.telegram.find((m) => m.at === '2026-11-23 09:00');
    expect(monday?.html).toContain('Hoy: 1 tarea (1 atrasada)');
  });

  it('un cron que se ejecuta dos veces en el mismo minuto no envía dos veces lo mismo', async () => {
    const w = world('2026-11-17');
    await seed(w);
    await w.runUntil('2026-11-17 11:00');
    const before = w.telegram.length;
    w.at('2026-11-17', '11:00');
    await w.runUntil('2026-11-17 11:00');
    expect(w.telegram).toHaveLength(before);
  });

  it('«llamar el sábado a las 11» avisa un sábado aunque sea fin de semana', async () => {
    const w = world('2026-11-21');
    await w.items.createItem({ type: 'tarea', title: 'Llamar al de la tienda', area: 'personal', dueAt: madridToUtc('2026-11-21', '11:00', TZ).toISOString(), hasTime: true });
    await w.runUntil('2026-11-21 23:30');
    expect(w.telegram.map((m) => m.at)).toEqual(['2026-11-21 11:00']);
    expect(w.telegram[0].html).toContain('Ahora, a las 11:00');
  });

  it('el día del cambio de hora (lunes 26 de octubre, tras el domingo del cambio) sigue siendo a las 9:00 de Madrid', async () => {
    const w = world('2026-10-26');
    await w.items.createItem({ type: 'tarea', title: 'Pendiente', area: 'personal', dueAt: new Date(madridToUtc('2026-10-26', '00:00', TZ).getTime() - 2 * DAY).toISOString() });
    await w.runUntil('2026-10-26 09:00');
    expect(w.telegram.map((m) => m.at)).toEqual(['2026-10-26 09:00']);
  });
});
