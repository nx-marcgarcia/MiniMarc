/** Real wiring for /api/cron/morning: service-role client scoped to Marc. Server only. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAllowedEmail } from '@/lib/auth/allowlist';
import { revalidateUser } from '@/lib/cache/server';
import { calendarGatewayFor } from '@/lib/calendar/server';
import { createSupabaseItemsRepo } from '@/lib/db/items';
import { createSupabasePeopleRepo } from '@/lib/db/people';
import { createSupabaseResurfacingRepo } from '@/lib/db/resurfacing';
import { createSupabasePhotosRepo } from '@/lib/db/photos';
import { refreshMissingPreviews } from '@/lib/links/preview';
import { serverPreviewFetcher } from '@/lib/links/server';
import { createPushSubscriptionsRepo } from '@/lib/db/push';
import { createSettingsRepo } from '@/lib/db/settings';
import { buildDigestFor, buildWeekDigestFor } from '@/lib/digest/server';
import { createSupabasePhotoStorage } from '@/lib/photos/storage';
import { sendPush } from '@/lib/push/send';
import { deliverBriefing, runResurfacing, type ResurfaceDeps } from '@/lib/resurfacing/run';
import { createTelegramClient } from '@/lib/telegram/client';
import { appUrlFromEnv, telegramFromEnv } from '@/lib/telegram/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMorning, type MorningResult } from './morning';

/**
 * The single user: the auth user whose email is ALLOWED_EMAIL (same rule as the login). Robust
 * even if a stray user row ever existed, and fails closed: no ALLOWED_EMAIL → no user. The
 * 0002 trigger only lets that email sign up, so the first page holds it.
 */
export async function resolveUserId(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((u) => isAllowedEmail(u.email))?.id ?? null;
}

export async function morningRun(now = new Date()): Promise<MorningResult | { skipped: 'no_user' }> {
  const admin = createAdminClient();
  const userId = await resolveUserId(admin);
  if (!userId) return { skipped: 'no_user' };
  const settingsRepo = createSettingsRepo(admin, userId);
  const items = createSupabaseItemsRepo(admin, { userId });
  const subscriptions = () => createPushSubscriptionsRepo(admin, { userId }).list();
  const tg = telegramFromEnv(process.env);
  const resurfaceDeps = (): ResurfaceDeps => ({
    now,
    settings: settingsRepo,
    items,
    people: createSupabasePeopleRepo(admin, { userId }),
    resurfacing: createSupabaseResurfacingRepo(admin, { userId }),
    telegram: tg ? { client: createTelegramClient(tg.token), chatId: tg.chatId } : null,
    appUrl: appUrlFromEnv(process.env),
    subscriptions,
    sendPush: (sub, payload) => sendPush(sub, payload),
  });
  return runMorning({
    now,
    settings: settingsRepo,
    items,
    calendar: () => calendarGatewayFor(userId),
    buildDigest: (date, settings) => buildDigestFor({ client: admin, userId, date, now, settings, settingsRepo }),
    buildWeekDigest: (weekStart, settings) => buildWeekDigestFor({ client: admin, userId, weekStart, now, settings, settingsRepo }),
    subscriptions,
    sendPush: (sub, payload) => sendPush(sub, payload),
    resurface: () => runResurfacing(resurfaceDeps()),
    briefing: (digest) => deliverBriefing(resurfaceDeps(), digest),
    // Service role, scoped: rows by user_id, objects only under '{userId}/'.
    photos: createSupabasePhotosRepo(admin, { userId }),
    storage: createSupabasePhotoStorage(admin, { userId }),
    refreshPreviews: () => refreshMissingPreviews(items, serverPreviewFetcher),
    invalidate: (scopes) => revalidateUser(userId, scopes),
  });
}
