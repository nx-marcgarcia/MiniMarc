import { describe, expect, it } from 'vitest';
import { UserError } from '@/lib/actions/result';
import type { ResurfaceAction } from '@/lib/db/resurfacing';
import type { ActOutcome } from '@/lib/resurfacing/actions';
import type { TelegramClient } from '@/lib/telegram/client';
import { handleTelegramWebhook, type WebhookDeps } from '@/lib/telegram/webhook';

const SECRET = 's3cret-value';
const CHAT = '42';
const EVENT = '123e4567-e89b-12d3-a456-426614174000';

function setup(over: Partial<WebhookDeps> = {}, act?: (id: string, a: ResurfaceAction) => Promise<ActOutcome>) {
  const calls = { act: [] as [string, ResurfaceAction][], answered: [] as { id: string; text?: string }[], edited: [] as { chatId: string; messageId: number; html: string; buttons?: unknown }[], invalidated: 0 };
  const telegram: TelegramClient = {
    async sendMessage() {
      return 1;
    },
    async answerCallback(id, text) {
      calls.answered.push({ id, text });
    },
    async editMessage(m) {
      calls.edited.push(m);
    },
  };
  const deps: WebhookDeps = {
    secret: SECRET,
    chatId: CHAT,
    telegram,
    act:
      act ??
      (async (id, a) => {
        calls.act.push([id, a]);
        return { message: 'Hecha ✓', event: {} as ActOutcome['event'] };
      }),
    invalidate: () => void calls.invalidated++,
    ...over,
  };
  return { deps, calls };
}

const request = (body: unknown, headers: Record<string, string> = { 'X-Telegram-Bot-Api-Secret-Token': SECRET }) =>
  new Request('https://app.test/api/telegram/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const callback = (data: string, over: { chat?: number; from?: number; text?: string } = {}) => ({
  update_id: 1,
  callback_query: {
    id: 'cb1',
    from: { id: over.from ?? 42 },
    message: { message_id: 77, chat: { id: over.chat ?? 42 }, text: over.text ?? 'Atrasada\n«Llamar al seguro»\nVenció hace 3 días' },
    data,
  },
});

describe('autenticación', () => {
  it('sin cabecera secreta, o con otra, 401 y no hace nada', async () => {
    const a = setup();
    expect((await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`), {}), a.deps)).status).toBe(401);
    expect((await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`), { 'X-Telegram-Bot-Api-Secret-Token': 'otro' }), a.deps)).status).toBe(401);
    expect(a.calls.act).toEqual([]);
  });

  it('sin secreto configurado, siempre 401 (falla cerrado)', async () => {
    const a = setup({ secret: undefined });
    expect((await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`), { 'X-Telegram-Bot-Api-Secret-Token': '' }), a.deps)).status).toBe(401);
  });

  it('solo hace caso a mi chat: otro chat o quien pulsa desde otra cuenta se ignora (200, sin actuar)', async () => {
    const a = setup();
    for (const body of [callback(`r:${EVENT}:hecho`, { chat: 99 }), callback(`r:${EVENT}:hecho`, { from: 99 })]) {
      const res = await handleTelegramWebhook(request(body), a.deps);
      expect(res.status).toBe(200);
    }
    expect(a.calls.act).toEqual([]);
    expect(a.calls.answered).toEqual([]);
  });

  it('sin chat id configurado ignora todo', async () => {
    const a = setup({ chatId: undefined });
    expect((await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`)), a.deps)).status).toBe(200);
    expect(a.calls.act).toEqual([]);
  });
});

describe('botones', () => {
  it('Hecho: actúa, avisa con un toast, deja el mensaje con el resultado y sin botones, y caduca la caché', async () => {
    const a = setup();
    const res = await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`)), a.deps);
    expect(res.status).toBe(200);
    expect(a.calls.act).toEqual([[EVENT, 'hecho']]);
    expect(a.calls.answered).toEqual([{ id: 'cb1', text: 'Hecha ✓' }]);
    expect(a.calls.edited).toEqual([
      { chatId: '42', messageId: 77, html: '<b>Atrasada</b>\n«Llamar al seguro»\nVenció hace 3 días\n\n✔ Hecha ✓', buttons: [] },
    ]);
    expect(a.calls.invalidated).toBe(1);
  });

  it('escapa en HTML el texto que Telegram devuelve', async () => {
    const a = setup();
    await handleTelegramWebhook(request(callback(`r:${EVENT}:posponer`, { text: 'Idea\n«A <b> & B»\nSin tocar' })), a.deps);
    expect(a.calls.edited[0].html).toContain('«A &lt;b&gt; &amp; B»');
  });

  it('un error de los que se le dicen a Marc sale como aviso, sin tocar el mensaje', async () => {
    const a = setup({}, async () => {
      throw new UserError('Ese elemento ya no existe');
    });
    const res = await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`)), a.deps);
    expect(res.status).toBe(200);
    expect(a.calls.answered).toEqual([{ id: 'cb1', text: 'Ese elemento ya no existe' }]);
    expect(a.calls.edited).toEqual([]);
  });

  it('un error cualquiera no filtra detalles: mensaje genérico y 200 (que Telegram no reintente)', async () => {
    const a = setup({}, async () => {
      throw new Error('relation "items" does not exist');
    });
    const res = await handleTelegramWebhook(request(callback(`r:${EVENT}:hecho`)), a.deps);
    expect(res.status).toBe(200);
    expect(a.calls.answered).toEqual([{ id: 'cb1', text: 'No se ha podido. Inténtalo de nuevo.' }]);
  });

  it('un callback que no es nuestro se ignora (se responde para quitar el reloj de Telegram)', async () => {
    const a = setup();
    const res = await handleTelegramWebhook(request(callback('otra:cosa')), a.deps);
    expect(res.status).toBe(200);
    expect(a.calls.act).toEqual([]);
    expect(a.calls.answered).toEqual([{ id: 'cb1', text: undefined }]);
  });

  it('si no se puede editar el mensaje, la acción ya está hecha y no falla', async () => {
    const a = setup();
    a.deps.telegram = {
      async sendMessage() {
        return 1;
      },
      async answerCallback() {},
      async editMessage() {
        throw new Error('message is not modified');
      },
    };
    expect((await handleTelegramWebhook(request(callback(`r:${EVENT}:archivar`)), a.deps)).status).toBe(200);
    expect(a.calls.act).toEqual([[EVENT, 'archivar']]);
  });
});

describe('otros mensajes', () => {
  it('un mensaje de texto (la captura llega en la fase 5) se acepta sin hacer nada', async () => {
    const a = setup();
    const res = await handleTelegramWebhook(request({ update_id: 2, message: { message_id: 1, chat: { id: 42 }, from: { id: 42 }, text: 'comprar pan' } }), a.deps);
    expect(res.status).toBe(200);
    expect(a.calls.act).toEqual([]);
  });

  it('un cuerpo que no es JSON o no es una actualización, 200 sin hacer nada', async () => {
    const a = setup();
    expect((await handleTelegramWebhook(request('no es json'), a.deps)).status).toBe(200);
    expect((await handleTelegramWebhook(request({ foo: 'bar' }), a.deps)).status).toBe(200);
    expect(a.calls.act).toEqual([]);
  });
});
