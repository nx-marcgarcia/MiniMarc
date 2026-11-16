import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBackend, type DbBackend, type Row } from './backend';

export const CHANNELS = ['telegram', 'push', 'web'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ACTIONS = ['hecho', 'posponer', 'archivar', 'abrir'] as const;
export type ResurfaceAction = (typeof ACTIONS)[number];

/** One notice sent: what, why, where, and what Marc did with it. */
export interface ResurfacingEvent {
  id: string;
  /** Null for notices about something that is not an item (a person's birthday). */
  itemId: string | null;
  /** What the notice was about: `item:<id>` or `date:<personId>:<YYYY-MM-DD>`. Never sent twice in 7 days. */
  subject: string;
  /** Why it came up: atrasada, idea_olvidada, regalo_sin_comprar… */
  kind: string;
  channel: Channel;
  sentAt: string;
  action: ResurfaceAction | null;
  actedAt: string | null;
  telegramMessageId: number | null;
}

export type NewResurfacingEvent = Pick<ResurfacingEvent, 'itemId' | 'subject' | 'kind' | 'channel'> & { telegramMessageId?: number | null };

export interface ResurfacingRepo {
  record(e: NewResurfacingEvent): Promise<ResurfacingEvent>;
  get(id: string): Promise<ResurfacingEvent | null>;
  /** Throws when the notice does not exist. */
  markAction(id: string, action: ResurfaceAction): Promise<ResurfacingEvent>;
  setTelegramMessage(id: string, messageId: number): Promise<ResurfacingEvent>;
  /** Notices sent at or after this ISO instant, newest first. */
  sentSince(iso: string): Promise<ResurfacingEvent[]>;
  /** How many times this subject got this action (3 postponements → ask to archive). */
  countActions(subject: string, action: ResurfaceAction): Promise<number>;
}

export function rowToEvent(row: Row): ResurfacingEvent {
  return {
    id: String(row.id),
    itemId: (row.item_id as string | null) ?? null,
    subject: String(row.subject),
    kind: String(row.kind),
    channel: row.channel as Channel,
    sentAt: String(row.sent_at),
    action: (row.action as ResurfaceAction | null) ?? null,
    actedAt: (row.acted_at as string | null) ?? null,
    telegramMessageId: row.telegram_message_id == null ? null : Number(row.telegram_message_id),
  };
}

export function createResurfacingRepo(backend: DbBackend, opts: { now?: () => Date } = {}): ResurfacingRepo {
  const now = opts.now ?? (() => new Date());

  async function getOrThrow(id: string, patch: Row): Promise<ResurfacingEvent> {
    const [row] = await backend.select('resurfacing_events', { eq: { id } });
    if (!row) throw new Error('El aviso no existe');
    return rowToEvent(await backend.update('resurfacing_events', id, patch));
  }

  return {
    async record(e) {
      const row = await backend.insert('resurfacing_events', {
        item_id: e.itemId,
        subject: e.subject,
        kind: e.kind,
        channel: e.channel,
        sent_at: now().toISOString(),
        telegram_message_id: e.telegramMessageId ?? null,
      });
      return rowToEvent(row);
    },

    async get(id) {
      const [row] = await backend.select('resurfacing_events', { eq: { id } });
      return row ? rowToEvent(row) : null;
    },

    markAction: (id, action) => getOrThrow(id, { action, acted_at: now().toISOString() }),

    setTelegramMessage: (id, messageId) => getOrThrow(id, { telegram_message_id: messageId }),

    async sentSince(iso) {
      const rows = await backend.select('resurfacing_events', { gte: { sent_at: iso } });
      return rows.map(rowToEvent).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
    },

    async countActions(subject, action) {
      return (await backend.select('resurfacing_events', { eq: { subject, action } })).length;
    },
  };
}

export function createSupabaseResurfacingRepo(client: SupabaseClient, opts: { userId?: string } = {}): ResurfacingRepo {
  return createResurfacingRepo(createSupabaseBackend(client, opts));
}
