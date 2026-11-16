/** Telegram and app-URL settings from the environment (a plain object, so it is testable). */

export interface TelegramEnv {
  token: string;
  chatId: string;
}

const clean = (v: string | undefined) => v?.trim() || undefined;

/** The bot, when both its token and Marc's chat id are set; otherwise null (Telegram stays off). */
export function telegramFromEnv(env: Record<string, string | undefined>): TelegramEnv | null {
  const token = clean(env.TELEGRAM_BOT_TOKEN);
  const chatId = clean(env.TELEGRAM_CHAT_ID);
  return token && chatId ? { token, chatId } : null;
}

/** The app's public URL for the "Abrir" buttons: APP_URL, else Vercel's production domain, else localhost. */
export function appUrlFromEnv(env: Record<string, string | undefined>): string {
  const explicit = clean(env.APP_URL);
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = clean(env.VERCEL_PROJECT_PRODUCTION_URL);
  return vercel ? `https://${vercel}` : 'http://localhost:3000';
}
