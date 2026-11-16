import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TZ } from '@/lib/time';

export const DEFAULT_DIGEST_HOUR = 8;
/** Hours offered in Ajustes for the briefing: the send window opens at 9:00 (an older 6 to 8 means 9:00). */
export const DIGEST_HOURS = [9, 10, 11] as const;

/** Ajustes → "Resumen semanal": Monday (first working day), or off. "domingo" is kept for old rows: it now means Monday too. */
export const WEEKLY_OPTIONS = ['lunes', 'domingo', 'off'] as const;
export type WeeklyDigest = (typeof WEEKLY_OPTIONS)[number];
export const DEFAULT_WEEKLY: WeeklyDigest = 'lunes';

/** The three reminders inside the Mon-Fri 9:00-16:00 window (Ajustes lets Marc change them). */
export const DEFAULT_REMINDER_TIMES = ['11:00', '13:30', '15:30'] as const;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "9:5" is not a time, "9:05" is: valid ones as "HH:mm", sorted and unique; none valid = the defaults. */
export function cleanTimes(raw: unknown): string[] {
  const times = Array.isArray(raw)
    ? raw.flatMap((t) => {
        const m = typeof t === 'string' ? HHMM.exec(t.trim()) : null;
        return m ? [`${m[1].padStart(2, '0')}:${m[2]}`] : [];
      })
    : [];
  const unique = [...new Set(times)].sort();
  return unique.length ? unique : [...DEFAULT_REMINDER_TIMES];
}

export interface Settings {
  digestHour: number;
  tz: string;
  /** Local date of the last morning push ("YYYY-MM-DD"). */
  lastDigestDate: string | null;
  /** Cached digest headline (one AI call per day) and the local date it belongs to. */
  headline: string | null;
  headlineDate: string | null;
  weeklyDigest: WeeklyDigest;
  /** Monday ("YYYY-MM-DD") of the last week summarised by the weekly push, or null. */
  lastWeeklyDate: string | null;
  /** Cached weekly AI line (one call per week) and the Monday it belongs to. */
  weekHeadline: string | null;
  weekHeadlineWeek: string | null;
  /** Avisos (0013): by Web Push, by Telegram (only when the bot is configured). */
  notifyPush: boolean;
  notifyTelegram: boolean;
  /** "HH:mm" in `tz`, sorted. Empty = no reminders (0013 not applied: nowhere to record what was sent). */
  reminderTimes: string[];
  /** No avisos on national and Comunidad Valenciana holidays. */
  skipHolidays: boolean;
  /** "YYYY-MM-DD HH:mm" of the last reminder slot sent, so a repeated cron run sends nothing twice. */
  lastSlot: string | null;
}

export type SettingsPatch = Partial<Settings>;

export interface SettingsRepo {
  /** The user's row; created with the defaults (8 h, APP_TZ or Europe/Madrid) if missing. */
  get(): Promise<Settings>;
  update(patch: SettingsPatch): Promise<void>;
}

const COLUMNS = {
  digestHour: 'digest_hour',
  tz: 'tz',
  lastDigestDate: 'last_digest_date',
  headline: 'last_digest_headline',
  headlineDate: 'last_digest_headline_date',
  weeklyDigest: 'weekly_digest',
  lastWeeklyDate: 'last_weekly_date',
  weekHeadline: 'last_week_headline',
  weekHeadlineWeek: 'last_week_headline_week',
  notifyPush: 'notify_push',
  notifyTelegram: 'notify_telegram',
  reminderTimes: 'reminder_times',
  skipHolidays: 'skip_holidays',
  lastSlot: 'last_slot',
} as const satisfies Record<keyof Settings, string>;

const SELECT = Object.values(COLUMNS).join(', ');
/** Columns before 0013_resurfacing.sql. */
const SELECT_BEFORE_0013 = Object.values(COLUMNS).filter((c) => !c.startsWith('notify_') && !['reminder_times', 'skip_holidays', 'last_slot'].includes(c)).join(', ');
/** Columns before 0007_weekly.sql: read when that migration is not applied yet. */
const SELECT_BEFORE_0007 = ['digest_hour', 'tz', 'last_digest_date', 'last_digest_headline', 'last_digest_headline_date'].join(', ');

/**
 * Missing column = 0007 not applied: the weekly push stays off (it could not store
 * last_weekly_date, so it would repeat), everything else works as before.
 */
function weeklyFrom(value: unknown): WeeklyDigest {
  if (value === undefined) return 'off';
  return (WEEKLY_OPTIONS as readonly unknown[]).includes(value) ? (value as WeeklyDigest) : DEFAULT_WEEKLY;
}

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    digestHour: Number(row.digest_hour ?? DEFAULT_DIGEST_HOUR),
    tz: String(row.tz || DEFAULT_TZ),
    lastDigestDate: (row.last_digest_date as string | null) ?? null,
    headline: (row.last_digest_headline as string | null) ?? null,
    headlineDate: (row.last_digest_headline_date as string | null) ?? null,
    weeklyDigest: weeklyFrom(row.weekly_digest),
    lastWeeklyDate: (row.last_weekly_date as string | null) ?? null,
    weekHeadline: (row.last_week_headline as string | null) ?? null,
    weekHeadlineWeek: (row.last_week_headline_week as string | null) ?? null,
    // Without 0013 (no last_slot column) nothing may be sent: it could not be recorded.
    notifyPush: row.notify_push === undefined ? true : Boolean(row.notify_push),
    notifyTelegram: row.last_slot === undefined ? false : row.notify_telegram === undefined ? true : Boolean(row.notify_telegram),
    reminderTimes: row.last_slot === undefined ? [] : cleanTimes(row.reminder_times),
    skipHolidays: row.skip_holidays === undefined ? true : Boolean(row.skip_holidays),
    lastSlot: (row.last_slot as string | null) ?? null,
  };
}

export function defaultTz(): string {
  return process.env.APP_TZ || DEFAULT_TZ;
}

/**
 * Settings of `userId`. Works with the session client (RLS) and with the service-role client
 * (cron); every query is filtered by `user_id` either way.
 */
export function createSettingsRepo(client: SupabaseClient, userId: string): SettingsRepo {
  async function read(): Promise<Settings | null> {
    let res = await client.from('settings').select(SELECT).eq('user_id', userId).maybeSingle();
    // 42703 = undefined column: 0013 not applied yet, and then maybe 0007 neither.
    if (res.error?.code === '42703') res = await client.from('settings').select(SELECT_BEFORE_0013).eq('user_id', userId).maybeSingle();
    if (res.error?.code === '42703') res = await client.from('settings').select(SELECT_BEFORE_0007).eq('user_id', userId).maybeSingle();
    if (res.error) throw new Error(`select settings: ${res.error.message}`);
    return res.data ? rowToSettings(res.data as unknown as Record<string, unknown>) : null;
  }
  return {
    async get() {
      const found = await read();
      if (found) return found;
      const ins = await client
        .from('settings')
        .upsert({ user_id: userId, digest_hour: DEFAULT_DIGEST_HOUR, tz: defaultTz() }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (ins.error) throw new Error(`insert settings: ${ins.error.message}`);
      const created = await read();
      if (!created) throw new Error('settings: no se pudo crear la fila');
      return created;
    },
    async update(patch) {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) row[COLUMNS[k as keyof Settings]] = k === 'reminderTimes' ? cleanTimes(v) : v;
      const res = await client.from('settings').update(row).eq('user_id', userId);
      if (res.error) throw new Error(`update settings: ${res.error.message}`);
    },
  };
}

/**
 * The settings, or the defaults (8 h, default zone, headline not cached) when they cannot be
 * read, with a no-op repo so nothing is written. Lets /hoy and GET /api/hoy still show the digest.
 */
export async function loadSettingsOrDefaults(repo: SettingsRepo): Promise<{ settings: Settings; repo: SettingsRepo }> {
  try {
    return { settings: await repo.get(), repo };
  } catch {
    const settings: Settings = {
      digestHour: DEFAULT_DIGEST_HOUR,
      tz: defaultTz(),
      lastDigestDate: null,
      headline: null,
      headlineDate: null,
      weeklyDigest: DEFAULT_WEEKLY,
      lastWeeklyDate: null,
      weekHeadline: null,
      weekHeadlineWeek: null,
      notifyPush: true,
      notifyTelegram: false,
      reminderTimes: [],
      skipHolidays: true,
      lastSlot: null,
    };
    return { settings, repo: { get: async () => settings, update: async () => {} } };
  }
}
