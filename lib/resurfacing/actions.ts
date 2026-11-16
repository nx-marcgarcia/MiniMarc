/**
 * What the buttons of a notice do (Telegram's inline keyboard and "Para hoy" on the web share it):
 * Hecho, Posponer 1 semana and Archivar. The effect goes first and the action is recorded after it, so a
 * failure can be retried; a notice already acted on is a no-op (a double tap, or Telegram resending).
 */
import { UserError } from '@/lib/actions/result';
import { afterWrite, toggleDone, type ActionDeps } from '@/lib/actions/items';
import type { ItemsRepo } from '@/lib/db/items';
import type { PeopleRepo } from '@/lib/db/people';
import type { ResurfaceAction, ResurfacingEvent, ResurfacingRepo } from '@/lib/db/resurfacing';
import type { Item } from '@/lib/db/types';
import { completionStatus, isOpen, ITEM_TYPES } from '@/lib/items/itemTypes';
import { madridDateTime, madridToUtc } from '@/lib/time';
import type { Candidate } from './candidates';

export interface ActDeps {
  items: ItemsRepo;
  people: PeopleRepo;
  resurfacing: ResurfacingRepo;
  now: () => Date;
  tz: string;
  /** Timed tasks ↔ the "Tareas" calendar: a moved date or an archived task updates its event. */
  sync?: ActionDeps['sync'];
}

export interface ActOutcome {
  message: string;
  event: ResurfacingEvent;
}

export const SNOOZE_DAYS = 7;
const DAY = 86_400_000;

const GONE = 'Ese elemento ya no existe';

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

async function find(deps: ActDeps, id: string): Promise<Item> {
  const item = (await deps.items.listItems()).find((i) => i.id === id);
  if (!item) throw new UserError(GONE);
  return item;
}

async function done(deps: ActDeps, item: Item): Promise<string> {
  if (!isOpen(item)) return 'Ya estaba cerrado';
  const after = await toggleDone({ items: deps.items, people: deps.people, sync: deps.sync }, item.id, deps.now());
  // A repeating task is still open: it moved on to its next date.
  if (isOpen(after) && after.dueAt !== item.dueAt) return 'Hecha. Pasa a su próxima fecha';
  const label = ITEM_TYPES[item.type].states.find((s) => s.id === completionStatus(item.type))?.label ?? 'Hecho';
  return `${label} ✓`;
}

async function snooze(deps: ActDeps, item: Item): Promise<string> {
  const now = deps.now();
  const patch: Parameters<ItemsRepo['updateItem']>[1] = { snoozeCount: item.snoozeCount + 1 };
  if (item.type === 'tarea' && item.dueAt) {
    // A task moves its date (it stops being overdue) to 7 days from today, at the same local time.
    const { time } = madridDateTime(new Date(item.dueAt), deps.tz);
    const today = madridDateTime(now, deps.tz).date;
    patch.dueAt = madridToUtc(addDays(today, SNOOZE_DAYS), item.hasTime ? time : '00:00', deps.tz).toISOString();
  } else {
    patch.snoozedUntil = new Date(now.getTime() + SNOOZE_DAYS * DAY).toISOString();
  }
  await afterWrite(deps, await deps.items.updateItem(item.id, patch));
  return 'Pospuesto una semana';
}

/** Runs `action` on what the notice was about and records it. */
async function perform(deps: ActDeps, event: ResurfacingEvent, action: ResurfaceAction): Promise<ActOutcome> {
  if (event.action) return { message: 'Ya lo habías hecho', event };

  let message: string;
  if (!event.itemId) {
    // A person's date is not an item: it can only be put off (it will not come up again for a week).
    if (action !== 'posponer') throw new UserError('Eso se hace desde la ficha de la persona');
    message = 'Te lo recuerdo más adelante';
  } else {
    const item = await find(deps, event.itemId);
    if (action === 'hecho') message = await done(deps, item);
    else if (action === 'posponer') message = await snooze(deps, item);
    else if (action === 'archivar') {
      await afterWrite(deps, await deps.items.updateItem(item.id, { archived: true }));
      message = 'Archivado';
    } else message = '';
  }
  return { message, event: await deps.resurfacing.markAction(event.id, action) };
}

/** A button of a notice already sent (Telegram): the event says what it was about. */
export async function actOnEvent(deps: ActDeps, eventId: string, action: ResurfaceAction): Promise<ActOutcome> {
  const event = await deps.resurfacing.get(eventId);
  if (!event) throw new UserError('Ese aviso ya no existe');
  return perform(deps, event, action);
}

/** A button of "Para hoy" (web): nothing was sent, so the notice is recorded now, on the web channel. */
export async function actOnCandidate(deps: ActDeps, c: Pick<Candidate, 'subject' | 'itemId' | 'kind'>, action: ResurfaceAction): Promise<ActOutcome> {
  const event = await deps.resurfacing.record({ itemId: c.itemId, subject: c.subject, kind: c.kind, channel: 'web' });
  return perform(deps, event, action);
}
