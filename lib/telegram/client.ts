/**
 * A thin Telegram Bot API client over `fetch` (injected, so tests need no network). Errors never
 * carry the bot token: it lives in the request URL, and a failed fetch message would quote it.
 */
import type { InlineButton } from '@/lib/resurfacing/messages';

export class TelegramError extends Error {
  constructor(
    message: string,
    /** The Bot API's error_code (403 = blocked, 400 = bad request…), or 0 when there was no answer. */
    readonly code: number = 0,
  ) {
    super(message);
    this.name = 'TelegramError';
  }
}

export interface TelegramClient {
  /** The new message's id. */
  sendMessage(m: { chatId: string; html: string; buttons?: InlineButton[][] }): Promise<number>;
  answerCallback(callbackId: string, text?: string): Promise<void>;
  /** Replaces a message's text; `buttons: []` removes the keyboard. */
  editMessage(m: { chatId: string; messageId: number; html: string; buttons?: InlineButton[][] }): Promise<void>;
}

const API = 'https://api.telegram.org';
const TIMEOUT_MS = 8000;

export function createTelegramClient(token: string, fetchImpl: typeof fetch = fetch): TelegramClient {
  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${API}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Not the original message: it may quote the URL, and the URL holds the token.
      throw new TelegramError(`Telegram ${method}: sin respuesta`);
    }
    let json: { ok?: boolean; result?: T; error_code?: number; description?: string } = {};
    try {
      json = await res.json();
    } catch {
      // Not JSON: the status below says enough.
    }
    if (!res.ok || json.ok === false) {
      throw new TelegramError(`Telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`, json.error_code ?? res.status);
    }
    return json.result as T;
  }

  const markup = (buttons?: InlineButton[][]) => (buttons ? { reply_markup: { inline_keyboard: buttons } } : {});

  return {
    async sendMessage({ chatId, html, buttons }) {
      const r = await call<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...markup(buttons),
      });
      return r.message_id;
    },

    async answerCallback(callbackId, text) {
      await call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) });
    },

    async editMessage({ chatId, messageId, html, buttons }) {
      await call('editMessageText', { chat_id: chatId, message_id: messageId, text: html, parse_mode: 'HTML', ...markup(buttons) });
    },
  };
}
