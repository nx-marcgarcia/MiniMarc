import { describe, expect, it } from 'vitest';
import type { Digest } from '@/lib/digest/build';
import type { PushSub } from '@/lib/db/push';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createResurfacingRepo } from '@/lib/db/resurfacing';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import type { PushPayload } from '@/lib/push/send';
import { deliverBriefing, runResurfacing, type ResurfaceDeps } from '@/lib/resurfacing/run';
import { TelegramError, type TelegramClient } from '@/lib/telegram/client';
import { madridToUtc } from '@/lib/time';

const DAY = 86_400_000;
const SUB = { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' } as unknown as PushSub;

function baseSettings(over: Partial<Settings> = {}): Settings {
  return {
    digestHour: 9, tz: 'Europe/Madrid', lastDigestDate: null, headline: null, headlineDate: null, weeklyDigest: 'lunes', lastWeeklyDate: null,
    weekHeadline: null, weekHeadlineWeek: null, notifyPush: true, notifyTelegram: true, reminderTimes: ['11:00', '13:30', '15:30'], skipHolidays: true, lastSlot: null,
    ...over,
  };
}

function setup(opts: { at: string; time: string; settings?: Partial<Settings>; telegram?: 'ok' | 'fail' | 'none'; push?: 'ok' | 'fail' | 'none' }) {
  let now = madridToUtc(opts.at, opts.time);
  const clock = () => now;
  const backend = createMemoryBackend({ now: clock });
  const state = baseSettings(opts.settings);
  const settings: SettingsRepo = { get: async () => state, update: async (p) => void Object.assign(state, p) };
  const telegramSent: { chatId: string; html: string; buttons?: unknown }[] = [];
  const client: TelegramClient = {
    async sendMessage(m) {
      if (opts.telegram === 'fail') throw new TelegramError('Telegram sendMessage: Forbidden', 403);
      telegramSent.push(m);
      return 1000 + telegramSent.length;
    },
    async answerCallback() {},
    async editMessage() {},
  };
  const pushed: PushPayload[] = [];
  const deps = (): ResurfaceDeps => ({
    now,
    settings,
    items: createItemsRepo(backend, { now: clock }),
    people: createPeopleRepo(backend),
    resurfacing: createResurfacingRepo(backend, { now: clock }),
    telegram: opts.telegram === 'none' ? null : { client, chatId: '42' },
    appUrl: 'https://app.test',
    subscriptions: async () => (opts.push === 'none' ? [] : [SUB]),
    sendPush: async (_sub, payload) => {
      if (opts.push === 'fail') throw new Error('push down');
      pushed.push(payload);
    },
  });
  return { deps, state, telegramSent, pushed, goTo: (date: string, time: string) => void (now = madridToUtc(date, time)), events: () => createResurfacingRepo(backend).sentSince('2000-01-01T00:00:00.000Z') };
}

const overdue = (d: ResurfaceDeps, title: string, daysAgo = 3) =>
  d.items.createItem({ type: 'tarea', title, area: 'personal', dueAt: new Date(madridToUtc('2026-11-17', '00:00').getTime() - daysAgo * DAY).toISOString() });

describe('recordatorio de una franja', () => {
  it('un martes a las 11:00 manda lo atrasado por Telegram (con botones) y por push, y lo apunta', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00' });
    const t = await overdue(s.deps(), 'Llamar al seguro');
    const r = await runResurfacing(s.deps());
    expect(r.reminder).toBe('sent');
    expect(s.telegramSent).toHaveLength(1);
    expect(s.telegramSent[0].chatId).toBe('42');
    expect(s.telegramSent[0].html).toContain('<b>Atrasada</b>');
    expect(s.telegramSent[0].html).toContain('«Llamar al seguro»');
    const buttons = (s.telegramSent[0].buttons as { text: string }[][]).flat().map((b) => b.text);
    expect(buttons).toEqual(['Hecho', 'Posponer 1 semana', 'Archivar', 'Abrir']);
    expect(s.pushed).toEqual([{ title: 'Atrasada', body: '«Llamar al seguro» · Venció hace 3 días', url: '/tareas?area=personal', tag: `resurface-item:${t.id}` }]);
    expect((await s.events()).map((e) => [e.channel, e.subject, e.kind]).sort()).toEqual([['push', `item:${t.id}`, 'atrasada'], ['telegram', `item:${t.id}`, 'atrasada']]);
    expect(s.state.lastSlot).toBe('2026-11-17 11:00');
  });

  it('el mensaje de Telegram guarda su id para poder editarlo', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00', push: 'none' });
    await overdue(s.deps(), 'Llamar');
    await runResurfacing(s.deps());
    expect((await s.events())[0].telegramMessageId).toBe(1001);
  });

  it('si el cron corre dos veces seguidas, no envía dos veces lo mismo', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00' });
    await overdue(s.deps(), 'Llamar');
    await runResurfacing(s.deps());
    s.goTo('2026-11-17', '11:30');
    expect((await runResurfacing(s.deps())).reminder).toBe('not_due');
    expect(s.telegramSent).toHaveLength(1);
  });

  it('un sábado no envía nada', async () => {
    const s = setup({ at: '2026-11-21', time: '11:00' });
    await overdue(s.deps(), 'Llamar');
    expect((await runResurfacing(s.deps())).reminder).toBe('not_due');
    expect(s.telegramSent).toEqual([]);
    expect(s.pushed).toEqual([]);
    expect(s.state.lastSlot).toBeNull();
  });

  it('el lunes lo atrasado del fin de semana sale en la primera franja', async () => {
    const s = setup({ at: '2026-11-23', time: '11:00', settings: { lastSlot: '2026-11-20 15:30' } });
    await overdue(s.deps(), 'Se me pasó el viernes', 3);
    expect((await runResurfacing(s.deps())).reminder).toBe('sent');
  });

  it('sin nada que decir no envía nada, pero la franja queda gastada', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00' });
    const r = await runResurfacing(s.deps());
    expect(r.reminder).toBe('nothing');
    expect(s.telegramSent).toEqual([]);
    expect(s.state.lastSlot).toBe('2026-11-17 11:00');
  });

  it('las franjas del día no repiten el mismo item y mezclan tipos', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00', push: 'none' });
    const d = s.deps();
    const old = new Date(madridToUtc('2026-11-17', '00:00').getTime() - 60 * DAY).toISOString();
    await d.items.createItem({ type: 'idea', title: 'Idea A' }, { createdAt: old });
    await d.items.createItem({ type: 'idea', title: 'Idea B' }, { createdAt: old });
    await d.items.createItem({ type: 'libro', title: 'Libro C' }, { createdAt: old });
    for (const [time, label] of [['11:00', 'Idea olvidada'], ['13:30', 'Libro por leer'], ['15:30', 'Idea olvidada']] as const) {
      s.goTo('2026-11-17', time);
      await runResurfacing(s.deps());
      expect(s.telegramSent.at(-1)?.html).toContain(`<b>${label}</b>`);
    }
    const subjects = (await s.events()).map((e) => e.subject);
    expect(new Set(subjects).size).toBe(3);
  });

  it('con Telegram caído: no se rompe, el push sale igual y el aviso fallido no bloquea el item', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00', telegram: 'fail' });
    const t = await overdue(s.deps(), 'Llamar');
    const r = await runResurfacing(s.deps());
    expect(r.reminder).toBe('sent');
    expect(s.pushed).toHaveLength(1);
    expect((await s.events()).map((e) => e.channel)).toEqual(['push']);
    // La siguiente franja puede volver a ofrecerlo por Telegram, porque ese aviso no llegó a entregarse.
    expect((await s.events()).some((e) => e.channel === 'telegram' && e.subject === `item:${t.id}`)).toBe(false);
  });

  it('si no llegó por ningún canal, no queda apuntado (se podrá avisar en la siguiente franja)', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00', telegram: 'fail', push: 'fail' });
    await overdue(s.deps(), 'Llamar');
    const r = await runResurfacing(s.deps());
    expect(r.reminder).toBe('failed');
    expect(await s.events()).toEqual([]);
  });

  it('respeta los canales de Ajustes y que Telegram no esté configurado', async () => {
    const a = setup({ at: '2026-11-17', time: '11:00', settings: { notifyTelegram: false } });
    await overdue(a.deps(), 'Llamar');
    await runResurfacing(a.deps());
    expect([a.telegramSent.length, a.pushed.length]).toEqual([0, 1]);

    const b = setup({ at: '2026-11-17', time: '11:00', settings: { notifyPush: false } });
    await overdue(b.deps(), 'Llamar');
    await runResurfacing(b.deps());
    expect([b.telegramSent.length, b.pushed.length]).toEqual([1, 0]);

    const c = setup({ at: '2026-11-17', time: '11:00', telegram: 'none' });
    await overdue(c.deps(), 'Llamar');
    await runResurfacing(c.deps());
    expect([c.telegramSent.length, c.pushed.length]).toEqual([0, 1]);
  });

  it('sin ningún canal no hace nada ni gasta la franja', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00', settings: { notifyPush: false, notifyTelegram: false } });
    await overdue(s.deps(), 'Llamar');
    expect((await runResurfacing(s.deps())).reminder).toBe('not_due');
    expect(s.state.lastSlot).toBeNull();
  });

  it('lo de Trabajo no sale nunca', async () => {
    const s = setup({ at: '2026-11-17', time: '11:00' });
    const d = s.deps();
    await d.items.createItem({ type: 'tarea', title: 'Informe secreto', area: 'trabajo', dueAt: new Date(madridToUtc('2026-11-14', '00:00')).toISOString() });
    expect((await runResurfacing(s.deps())).reminder).toBe('nothing');
    expect(JSON.stringify([s.telegramSent, s.pushed])).not.toContain('secreto');
  });
});

describe('tareas con hora exacta', () => {
  it('«llamar el sábado a las 11» avisa un sábado, fuera de la ventana, y una sola vez', async () => {
    const s = setup({ at: '2026-11-21', time: '11:00' });
    const d = s.deps();
    await d.items.createItem({ type: 'tarea', title: 'Llamar al de la tienda', area: 'personal', dueAt: madridToUtc('2026-11-21', '11:00').toISOString(), hasTime: true });
    const first = await runResurfacing(s.deps());
    expect(first.timed).toBe(1);
    expect(s.telegramSent[0].html).toContain('Ahora, a las 11:00');
    s.goTo('2026-11-21', '11:30');
    expect((await runResurfacing(s.deps())).timed).toBe(0);
    expect(s.telegramSent).toHaveLength(1);
  });
});

describe('deliverBriefing', () => {
  const digest = (over: Partial<Digest> = {}): Digest => ({
    dayTasks: [],
    date: '2026-11-17', events: [], calendarError: null,
    tasks: { personal: { items: [{ item: { id: 'x', title: 't' } as never, overdue: false }], more: 0 }, trabajo: { items: [], more: 0 } },
    unclassified: 2, dates: [], headline: 'Buenos días', ...over,
  });

  it('manda el briefing por Telegram con lo rescatado y sus botones, y apunta lo rescatado', async () => {
    const s = setup({ at: '2026-11-17', time: '09:00', push: 'none' });
    const d = s.deps();
    const old = new Date(madridToUtc('2026-11-17', '00:00').getTime() - 60 * DAY).toISOString();
    const idea = await d.items.createItem({ type: 'idea', title: 'App de recetas' }, { createdAt: old });
    await deliverBriefing(s.deps(), digest());
    expect(s.telegramSent).toHaveLength(1);
    const html = s.telegramSent[0].html;
    expect(html).toContain('Hoy: 1 tarea');
    expect(html).toContain('Bandeja: 2 por revisar');
    expect(html).toContain('Rescatado: «App de recetas»');
    expect((s.telegramSent[0].buttons as { text: string }[][]).flat().map((b) => b.text)).toEqual(['Hecho', 'Posponer 1 semana', 'Archivar', 'Abrir']);
    expect((await s.events()).map((e) => [e.subject, e.kind])).toEqual([[`item:${idea.id}`, 'idea_olvidada']]);
  });

  it('un día vacío es un mensaje de una línea, sin botones', async () => {
    const s = setup({ at: '2026-11-17', time: '09:00', push: 'none' });
    await deliverBriefing(s.deps(), digest({ tasks: { personal: { items: [], more: 0 }, trabajo: { items: [], more: 0 } }, unclassified: 0, headline: 'Buenos días. Día tranquilo.' }));
    expect(s.telegramSent).toHaveLength(1);
    expect(s.telegramSent[0].html).toBe('<b>Buenos días. Día tranquilo.</b>');
    expect(s.telegramSent[0].buttons).toBeUndefined();
  });

  it('con Telegram apagado o sin configurar no envía nada por Telegram', async () => {
    const s = setup({ at: '2026-11-17', time: '09:00', settings: { notifyTelegram: false } });
    await deliverBriefing(s.deps(), digest());
    expect(s.telegramSent).toEqual([]);
  });

  it('si Telegram falla no lanza (el push del resumen no depende de esto)', async () => {
    const s = setup({ at: '2026-11-17', time: '09:00', telegram: 'fail' });
    await expect(deliverBriefing(s.deps(), digest())).resolves.toBeDefined();
  });
});
