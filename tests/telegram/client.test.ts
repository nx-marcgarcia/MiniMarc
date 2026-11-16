import { describe, expect, it } from 'vitest';
import { createTelegramClient, TelegramError } from '@/lib/telegram/client';

function fakeFetch(reply: (url: string, body: unknown) => { status?: number; json: unknown }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, body });
    const r = reply(url, body);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const TOKEN = '123456:SECRET-TOKEN';

describe('createTelegramClient', () => {
  it('sendMessage manda el HTML y los botones al chat y devuelve el id del mensaje', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { ok: true, result: { message_id: 77 } } }));
    const tg = createTelegramClient(TOKEN, fetchImpl);
    const id = await tg.sendMessage({ chatId: '42', html: '<b>Hola</b>', buttons: [[{ text: 'Hecho', callback_data: 'r:1:hecho' }]] });
    expect(id).toBe(77);
    expect(calls[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(calls[0].body).toEqual({
      chat_id: '42',
      text: '<b>Hola</b>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: 'Hecho', callback_data: 'r:1:hecho' }]] },
    });
  });

  it('sin botones no manda reply_markup', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { ok: true, result: { message_id: 1 } } }));
    await createTelegramClient(TOKEN, fetchImpl).sendMessage({ chatId: '42', html: 'x' });
    expect(calls[0].body).not.toHaveProperty('reply_markup');
  });

  it('answerCallback y editMessage llaman a sus métodos', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ json: { ok: true, result: true } }));
    const tg = createTelegramClient(TOKEN, fetchImpl);
    await tg.answerCallback('cb1', 'Hecho ✓');
    await tg.editMessage({ chatId: '42', messageId: 77, html: 'Listo', buttons: [] });
    expect(calls[0].url).toMatch(/\/answerCallbackQuery$/);
    expect(calls[0].body).toEqual({ callback_query_id: 'cb1', text: 'Hecho ✓' });
    expect(calls[1].url).toMatch(/\/editMessageText$/);
    expect(calls[1].body).toMatchObject({ chat_id: '42', message_id: 77, text: 'Listo', parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
  });

  it('un error de Telegram es un TelegramError que NO lleva el token', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 403, json: { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' } }));
    const err = await createTelegramClient(TOKEN, fetchImpl).sendMessage({ chatId: '42', html: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramError);
    expect((err as TelegramError).code).toBe(403);
    expect(String((err as Error).message)).toContain('bot was blocked');
    expect(JSON.stringify(err)).not.toContain('SECRET-TOKEN');
    expect(String((err as Error).message)).not.toContain('SECRET-TOKEN');
  });

  it('si la red cae, tampoco filtra el token', async () => {
    const fetchImpl = (async () => {
      throw new Error(`fetch failed for https://api.telegram.org/bot${TOKEN}/sendMessage`);
    }) as unknown as typeof fetch;
    const err = await createTelegramClient(TOKEN, fetchImpl).sendMessage({ chatId: '42', html: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramError);
    expect(String((err as Error).message)).not.toContain('SECRET-TOKEN');
  });
});
