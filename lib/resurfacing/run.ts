/**
 * The resurfacing run, called by the 30-minute cron (lib/cron/morning.ts): exact-time notices, the
 * reminder slot that is due and the briefing's Telegram message. Everything it needs comes in
 * through `ResurfaceDeps`, so it is tested with fakes.
 *
 * Idempotent: the slot is marked BEFORE anything is sent (a repeated run finds it spent), every
 * notice is recorded in resurfacing_events (the same thing is never offered twice in 7 days) and
 * a notice that reached no channel is forgotten, so the next slot can offer it again.
 * A failing channel never stops the other, and nothing here throws at the cron.
 */
import type { PeopleRepo } from '@/lib/db/people';
import type { ItemsRepo } from '@/lib/db/items';
import type { PushSub } from '@/lib/db/push';
import type { ResurfacingEvent, ResurfacingRepo } from '@/lib/db/resurfacing';
import type { Settings, SettingsRepo } from '@/lib/db/settings';
import type { Digest } from '@/lib/digest/build';
import type { PushPayload } from '@/lib/push/send';
import type { TelegramClient } from '@/lib/telegram/client';
import { madridDateTime } from '@/lib/time';
import {
  DATE_WINDOW_DAYS,
  findCandidates,
  pickCandidate,
  REPEAT_AFTER_DAYS,
  type Candidate,
} from './candidates';
import { briefingLines, escapeHtml, KIND_LABELS, reminderButtons, reminderLines } from './messages';
import { dueReminderSlot } from './slots';
import { timedDue } from './timed';

export interface ResurfaceDeps {
  now: Date;
  settings: SettingsRepo;
  items: ItemsRepo;
  people: PeopleRepo;
  resurfacing: ResurfacingRepo;
  /** Null when the bot is not configured (no token or chat id). */
  telegram: { client: TelegramClient; chatId: string } | null;
  /** The app's public URL, for the "Abrir" buttons. */
  appUrl: string;
  subscriptions: () => Promise<PushSub[]>;
  sendPush: (sub: PushSub, payload: PushPayload) => Promise<void>;
}

export interface ResurfaceResult {
  /** Exact-time notices sent in this run. */
  timed: number;
  reminder: 'sent' | 'nothing' | 'not_due' | 'failed';
}

const DAY = 86_400_000;

const html = (lines: string[]) => [`<b>${escapeHtml(lines[0])}</b>`, ...lines.slice(1).map(escapeHtml)].join('\n');

/** Whether a channel is on in Ajustes and available (the bot configured). */
function channels(deps: ResurfaceDeps, s: Settings) {
  return { telegram: s.notifyTelegram && deps.telegram !== null, push: s.notifyPush };
}

interface Message {
  /** Telegram text, line by line (the first one goes in bold). */
  lines: string[];
  push: Pick<PushPayload, 'title' | 'body'>;
}

/**
 * Sends one notice over every enabled channel, recording each. True when it reached at least one.
 * `withButtons` false (the briefing without a rescued item) sends plain text.
 */
async function deliver(deps: ResurfaceDeps, s: Settings, c: Candidate | null, subject: { itemId: string | null; subject: string; kind: string }, msg: Message): Promise<boolean> {
  const on = channels(deps, s);
  let reached = false;

  if (on.telegram && deps.telegram) {
    const { client, chatId } = deps.telegram;
    try {
      const event = await deps.resurfacing.record({ ...subject, channel: 'telegram' });
      try {
        const buttons = c ? reminderButtons(event.id, c, { appUrl: deps.appUrl, href: c.href }) : undefined;
        const messageId = await client.sendMessage({ chatId, html: html(msg.lines), buttons });
        await deps.resurfacing.setTelegramMessage(event.id, messageId).catch(() => undefined);
        reached = true;
      } catch {
        await deps.resurfacing.forget(event.id).catch(() => undefined);
      }
    } catch {
      // Could not even record it: nothing was sent.
    }
  }

  if (on.push) {
    try {
      const subs = await deps.subscriptions();
      if (subs.length > 0) {
        const event = await deps.resurfacing.record({ ...subject, channel: 'push' });
        const payload: PushPayload = { ...msg.push, url: c?.href ?? '/hoy', tag: `resurface-${subject.subject}` };
        const results = await Promise.allSettled(subs.map((sub) => deps.sendPush(sub, payload)));
        if (results.some((r) => r.status === 'fulfilled')) reached = true;
        else await deps.resurfacing.forget(event.id).catch(() => undefined);
      }
    } catch {
      // Push is an extra channel: a failure here never stops the rest.
    }
  }
  return reached;
}

const reminderMessage = (c: Candidate): Message => ({
  lines: reminderLines(c),
  push: { title: KIND_LABELS[c.kind], body: `«${c.title}» · ${c.detail}` },
});

async function recentEvents(deps: ResurfaceDeps): Promise<ResurfacingEvent[]> {
  return deps.resurfacing.sentSince(new Date(deps.now.getTime() - REPEAT_AFTER_DAYS * DAY).toISOString());
}

/** The last kinds sent, newest first (to avoid the same kind twice in a row). */
const recentKinds = (events: ResurfacingEvent[]) => [...events].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)).map((e) => e.kind);

export async function runResurfacing(deps: ResurfaceDeps): Promise<ResurfaceResult> {
  const result: ResurfaceResult = { timed: 0, reminder: 'not_due' };
  const s = await deps.settings.get();
  const on = channels(deps, s);
  if (!on.telegram && !on.push) return result;

  const tz = s.tz;
  const items = await deps.items.listItems();
  const sent = await recentEvents(deps);

  // 1. Exact-time notices: at their time, window or not.
  for (const c of timedDue({ now: deps.now, tz, items, sent })) {
    if (await deliver(deps, s, c, { itemId: c.itemId, subject: c.subject, kind: c.kind }, reminderMessage(c))) result.timed++;
  }

  // 2. The reminder slot that is due.
  const slot = dueReminderSlot(deps.now, s);
  if (!slot) return result;
  // Spent first: a repeated run (or a crash after sending) must not send the slot twice.
  await deps.settings.update({ lastSlot: slot });

  const today = madridDateTime(deps.now, tz).date;
  const upcoming = await deps.people.upcomingDates(today, DATE_WINDOW_DAYS);
  const pick = pickCandidate(findCandidates({ now: deps.now, tz, items, upcoming, sent: await recentEvents(deps) }), recentKinds(sent));
  if (!pick) {
    result.reminder = 'nothing';
    return result;
  }
  result.reminder = (await deliver(deps, s, pick, { itemId: pick.itemId, subject: pick.subject, kind: pick.kind }, reminderMessage(pick))) ? 'sent' : 'failed';
  return result;
}

/**
 * The briefing's own message on Telegram: the day in a few lines plus one thing rescued (with its
 * buttons). The Web Push of the briefing is sent by the morning job itself. Never throws.
 */
export async function deliverBriefing(deps: ResurfaceDeps, digest: Digest): Promise<{ rescued: boolean }> {
  try {
    const s = await deps.settings.get();
    if (!s.notifyTelegram || !deps.telegram) return { rescued: false };
    const today = madridDateTime(deps.now, s.tz).date;
    const [items, upcoming, sent] = await Promise.all([deps.items.listItems(), deps.people.upcomingDates(today, DATE_WINDOW_DAYS), recentEvents(deps)]);
    const all = findCandidates({ now: deps.now, tz: s.tz, items, upcoming, sent });
    // Something forgotten beats a repeat of what the day's lines already say.
    const rescued = pickCandidate(all.filter((c) => !c.urgent), recentKinds(sent)) ?? null;
    const lines = briefingLines(digest, rescued);
    const subject = rescued ? { itemId: rescued.itemId, subject: rescued.subject, kind: rescued.kind } : null;

    if (!rescued || !subject) {
      // No rescued item: plain text, nothing to record.
      await deps.telegram.client.sendMessage({ chatId: deps.telegram.chatId, html: html(lines) }).catch(() => undefined);
      return { rescued: false };
    }
    const reached = await deliver(deps, { ...s, notifyPush: false }, rescued, subject, { lines, push: { title: 'Buenos días', body: lines.join('\n') } });
    return { rescued: reached };
  } catch {
    return { rescued: false };
  }
}
