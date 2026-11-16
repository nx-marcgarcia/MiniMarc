import { connection } from 'next/server';
import { handleTelegramWebhook } from '@/lib/telegram/webhook';
import { webhookDeps } from '@/lib/telegram/server';

// Telegram's webhook (setWebhook with secret_token = TELEGRAM_WEBHOOK_SECRET). See docs/despliegue.md, "Telegram".
export async function POST(request: Request) {
  await connection();
  return handleTelegramWebhook(request, webhookDeps());
}
