/** Real wiring for /api/telegram/webhook: service-role repos scoped to Marc (single user). Server only. */
import { UserError } from '@/lib/actions/result';
import { revalidateUser } from '@/lib/cache/server';
import { WRITES } from '@/lib/cache/tags';
import { resolveUserId } from '@/lib/cron/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { createSupabaseResurfacingRepo } from '@/lib/db/resurfacing';
import { actOnEvent } from '@/lib/resurfacing/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_TZ } from '@/lib/time';
import { createTelegramClient } from './client';
import { telegramFromEnv } from './env';
import type { WebhookDeps } from './webhook';

export function webhookDeps(): WebhookDeps {
  const tg = telegramFromEnv(process.env);
  const admin = createAdminClient();
  let user: Promise<string | null> | undefined;
  const userId = () => (user ??= resolveUserId(admin));

  return {
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    chatId: tg?.chatId,
    telegram: tg ? createTelegramClient(tg.token) : null,
    async act(eventId, action) {
      const id = await userId();
      if (!id) throw new UserError('No encuentro tu usuario.');
      return actOnEvent(
        {
          items: createSupabaseItemsRepo(admin, { userId: id }),
          people: createSupabasePeopleRepo(admin, { userId: id }),
          resurfacing: createSupabaseResurfacingRepo(admin, { userId: id }),
          now: () => new Date(),
          tz: process.env.APP_TZ || DEFAULT_TZ,
        },
        eventId,
        action,
      );
    },
    invalidate() {
      void userId().then((id) => id && revalidateUser(id, WRITES.item));
    },
  };
}
