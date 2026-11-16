/**
 * `POST /api/telegram/webhook`, testable: Telegram sends the bot's updates here. The route is
 * protected by the secret Telegram echoes in `X-Telegram-Bot-Api-Secret-Token` (set with setWebhook),
 * and only Marc's chat is obeyed: any other chat is ignored with a plain 200.
 *
 * Today it understands the buttons of a notice (Hecho, Posponer 1 semana, Archivar). Text, links,
 * photos and voice notes will be captured here in phase 5. It always answers 200 once the secret
 * checks out, so Telegram never retries a delivery in a loop; errors go to Marc as a short toast and
 * never carry technical detail.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { UserError } from '@/lib/actions/result';
import type { ResurfaceAction } from '@/lib/db/resurfacing';
import type { ActOutcome } from '@/lib/resurfacing/actions';
import { escapeHtml, parseCallback } from '@/lib/resurfacing/messages';
import type { TelegramClient } from './client';

export interface WebhookDeps {
  /** TELEGRAM_WEBHOOK_SECRET; absent = every request is refused. */
  secret: string | undefined;
  /** TELEGRAM_CHAT_ID: the only chat that is obeyed; absent = everything is ignored. */
  chatId: string | undefined;
  telegram: TelegramClient | null;
  act: (eventId: string, action: ResurfaceAction) => Promise<ActOutcome>;
  /** Expires the cached lists after an action changed an item. */
  invalidate: () => void;
}

const GENERIC_ERROR = 'No se ha podido. Inténtalo de nuevo.';

const updateSchema = z.object({
  callback_query: z
    .object({
      id: z.string(),
      from: z.object({ id: z.number() }),
      message: z.object({ message_id: z.number(), chat: z.object({ id: z.number() }), text: z.string().optional() }).optional(),
      data: z.string().optional(),
    })
    .optional(),
});

const digest = (s: string) => createHash('sha256').update(s).digest();

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return timingSafeEqual(digest(header ?? ''), digest(secret));
}

const ok = () => Response.json({ ok: true });

/** The notice's text again with what happened under it; its first line was the bold one. */
function withOutcome(text: string, outcome: string): string {
  const [first = '', ...rest] = text.split('\n');
  return [`<b>${escapeHtml(first)}</b>`, ...rest.map(escapeHtml), '', `✔ ${escapeHtml(outcome)}`].join('\n');
}

export async function handleTelegramWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (!authorized(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), deps.secret)) {
    return Response.json({ message: 'No autorizado' }, { status: 401 });
  }
  let update: z.infer<typeof updateSchema>;
  try {
    update = updateSchema.parse(await req.json());
  } catch {
    return ok();
  }
  const cb = update.callback_query;
  if (!cb || !deps.telegram || !deps.chatId) return ok();

  // Only Marc's chat, pressed by Marc's account.
  const chat = cb.message?.chat.id;
  if (String(chat) !== deps.chatId || String(cb.from.id) !== deps.chatId) return ok();

  const telegram = deps.telegram;
  const parsed = parseCallback(cb.data ?? '');
  if (!parsed) {
    await telegram.answerCallback(cb.id).catch(() => undefined);
    return ok();
  }

  try {
    const outcome = await deps.act(parsed.eventId, parsed.action);
    deps.invalidate();
    await telegram.answerCallback(cb.id, outcome.message).catch(() => undefined);
    if (cb.message) {
      await telegram
        .editMessage({ chatId: String(chat), messageId: cb.message.message_id, html: withOutcome(cb.message.text ?? '', outcome.message), buttons: [] })
        .catch(() => undefined); // The action is done; a message that cannot be edited is not an error.
    }
  } catch (e) {
    await telegram.answerCallback(cb.id, e instanceof UserError ? e.message : GENERIC_ERROR).catch(() => undefined);
  }
  return ok();
}
