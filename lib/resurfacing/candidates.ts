/**
 * What the brain can bring back to Marc, and which one it picks. Pure: the cron hands in the items,
 * the next dates and what was already sent.
 *
 * Kinds, most urgent first: tareas atrasadas o de hoy, cumpleaños y fechas sin regalo comprado,
 * garantías que caducan, compras urgentes que llevan semanas, y después lo olvidado (ideas sin tocar,
 * enlaces sin ver, libros por leer). Candidaturas llegarán con su tipo (fase 9).
 *
 * Never: lo de Trabajo (tareas y personas: nada de Trabajo sale hacia Telegram), lo archivado, lo
 * pendiente de revisión, lo ya hecho, lo pospuesto hasta una fecha futura, ni lo avisado en los
 * últimos 7 días.
 */
import type { UpcomingDate } from '@/lib/db/people';
import type { ResurfacingEvent } from '@/lib/db/resurfacing';
import type { Item } from '@/lib/db/types';
import { itemHref } from '@/lib/items/href';
import { isOpen } from '@/lib/items/itemTypes';
import { countdown } from '@/lib/people/format';
import { occasionsWithGifts } from '@/lib/regalos';
import { deadlineOf, followUpOn, isWaiting, waitingFor, waitingSince } from '@/lib/tareas';
import { madridDateTime } from '@/lib/time';

export type CandidateKind =
  | 'atrasada'
  | 'vence_hoy'
  | 'regalo_sin_comprar'
  | 'garantia'
  | 'compra_urgente'
  | 'idea_olvidada'
  | 'enlace_olvidado'
  | 'libro_pendiente'
  /** An open task with no date that has gone untouched for a while. */
  | 'tarea_aplazada'
  /** A task in espera whose day to look at it again has come. */
  | 'seguimiento'
  /** A task with an exact time (or a reminder Marc set): goes out at that time, window or not (timed.ts). */
  | 'con_hora';

export interface Candidate {
  /** What it is about: `item:<id>` or `date:<personId>:<YYYY-MM-DD>`. */
  subject: string;
  itemId: string | null;
  kind: CandidateKind;
  /** Dates, overdue tasks, warranties and urgent purchases beat anything forgotten. */
  urgent: boolean;
  /** Lower first. */
  rank: number;
  title: string;
  /** Where "Abrir" goes inside the app. */
  href: string;
  /** One short line: why it came up. */
  detail: string;
  /** Postponed 3 times already: ask whether to archive it. */
  askArchive: boolean;
}

export const REPEAT_AFTER_DAYS = 7;
export const IDEA_STALE_DAYS = 30;
export const TASK_STALE_DAYS = 14;
export const LINK_STALE_DAYS = 60;
export const BOOK_STALE_DAYS = 60;
export const URGENT_PURCHASE_DAYS = 14;
export const WARRANTY_WINDOW_DAYS = 30;
export const DATE_WINDOW_DAYS = 10;
export const SNOOZES_BEFORE_ASKING = 3;

const DAY = 86_400_000;
const RANK: Record<CandidateKind, number> = {
  atrasada: 1,
  vence_hoy: 2,
  seguimiento: 2,
  regalo_sin_comprar: 3,
  garantia: 4,
  compra_urgente: 5,
  idea_olvidada: 6,
  tarea_aplazada: 6,
  enlace_olvidado: 7,
  libro_pendiente: 8,
  con_hora: 0,
};
const URGENT_UP_TO = 5;

export interface CandidateInput {
  now: Date;
  tz: string;
  items: Item[];
  /** Birthdays and special dates, from today on (the engine keeps the next 10 days). */
  upcoming: UpcomingDate[];
  /** Notices sent in the last days (older ones are ignored). */
  sent: ResurfacingEvent[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const ageDays = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(iso)) / DAY);
/** "9 días", "4 semanas", "3 meses": how long something has been parked. */
export const tiempo = (days: number) => (days < 14 ? plural(days, 'día', 'días') : days < 60 ? plural(Math.floor(days / 7), 'semana', 'semanas') : plural(Math.floor(days / 30), 'mes', 'meses'));
const hace = (days: number) => (days < 60 ? `hace ${plural(days, 'día', 'días')}` : `hace ${plural(Math.floor(days / 30), 'mes', 'meses')}`);

export function findCandidates(input: CandidateInput): Candidate[] {
  const { now, tz } = input;
  const today = madridDateTime(now, tz).date;
  const recent = new Set(input.sent.filter((e) => now.getTime() - Date.parse(e.sentAt) < REPEAT_AFTER_DAYS * DAY).map((e) => e.subject));
  const out: (Candidate & { since: string })[] = [];

  const add = (kind: CandidateKind, subject: string, itemId: string | null, title: string, detail: string, since: string, href: string, snoozeCount = 0) => {
    if (recent.has(subject)) return;
    out.push({ subject, itemId, kind, urgent: RANK[kind] <= URGENT_UP_TO, rank: RANK[kind], title, href, detail, since, askArchive: snoozeCount >= SNOOZES_BEFORE_ASKING });
  };

  for (const item of input.items) {
    if (item.area === 'trabajo' || item.needsReview || item.archived || !isOpen(item)) continue;
    if (item.snoozedUntil && Date.parse(item.snoozedUntil) > now.getTime()) continue;
    const subject = `item:${item.id}`;
    const data = item.data;

    if (isWaiting(item)) {
      // Waiting: no "overdue" nagging; it asks once, on the day to look at it again.
      const on = followUpOn(item);
      if (on && on <= today) {
        const since = waitingSince(item);
        const who = waitingFor(item);
        const days = since ? daysBetween(since, today) : null;
        const detail = `${days !== null ? `Lleva ${plural(days, 'día', 'días')} en espera` : 'Toca mirar si ha llegado'}${who ? ` de ${who}` : ''}${days !== null ? '. ¿Ha llegado?' : ''}`;
        add('seguimiento', subject, item.id, item.title, detail, `${on}T00:00:00.000Z`, itemHref(item), item.snoozeCount);
      }
      continue;
    }
    if (item.type === 'tarea' && (item.dueAt || deadlineOf(item))) {
      const deadline = deadlineOf(item);
      const deadlineDays = deadline ? daysBetween(today, deadline) : null;
      const days = item.dueAt ? daysBetween(today, madridDateTime(new Date(item.dueAt), tz).date) : null;
      const since = item.dueAt ?? `${deadline}T00:00:00.000Z`;
      // The deadline is the commitment: it speaks first, even when the planned date is still ahead.
      if (deadlineDays !== null && deadlineDays < 0) add('atrasada', subject, item.id, item.title, `Su fecha límite pasó ${hace(-deadlineDays)}`, since, itemHref(item), item.snoozeCount);
      else if (days !== null && days < 0) add('atrasada', subject, item.id, item.title, `Venció ${hace(-days)}`, since, itemHref(item), item.snoozeCount);
      else if (deadlineDays === 0 && !(item.hasTime && days === 0)) add('vence_hoy', subject, item.id, item.title, 'Su fecha límite es hoy', since, itemHref(item), item.snoozeCount);
      else if (days === 0 && !item.hasTime) add('vence_hoy', subject, item.id, item.title, 'Vence hoy', since, itemHref(item), item.snoozeCount);
    } else if (item.type === 'tarea' && ageDays(item.updatedAt, now) >= TASK_STALE_DAYS) {
      add('tarea_aplazada', subject, item.id, item.title, `Lleva ${tiempo(ageDays(item.updatedAt, now))} sin tocarse. ¿La haces o la dejas para más adelante?`, item.updatedAt, itemHref(item), item.snoozeCount);
    } else if (item.type === 'idea' && (item.status === 'semilla' || item.status === 'explorando') && ageDays(item.updatedAt, now) >= IDEA_STALE_DAYS) {
      add('idea_olvidada', subject, item.id, item.title, `Lleva ${tiempo(ageDays(item.updatedAt, now))} parada. ¿Defines un primer paso?`, item.updatedAt, itemHref(item), item.snoozeCount);
    } else if (item.type === 'enlace' && item.status === 'por_ver' && ageDays(item.createdAt, now) > LINK_STALE_DAYS) {
      add('enlace_olvidado', subject, item.id, item.title, `Lo guardaste ${hace(ageDays(item.createdAt, now))} y sigue sin ver`, item.createdAt, itemHref(item), item.snoozeCount);
    } else if (item.type === 'libro' && item.status === 'por_leer' && ageDays(item.createdAt, now) >= BOOK_STALE_DAYS) {
      add('libro_pendiente', subject, item.id, item.title, `Lo guardaste ${hace(ageDays(item.createdAt, now))} y sigue por leer`, item.createdAt, itemHref(item), item.snoozeCount);
    } else if (item.type === 'compra' && (item.status === 'quiero' || item.status === 'en_carrito') && data.urgency === 'alta' && ageDays(item.createdAt, now) >= URGENT_PURCHASE_DAYS) {
      add('compra_urgente', subject, item.id, item.title, `Urgente, en tu lista ${hace(ageDays(item.createdAt, now))}`, item.createdAt, itemHref(item), item.snoozeCount);
    }
  }

  // Warranties: a bought item is not "open", so they are read apart from the loop above.
  for (const item of input.items) {
    if (item.type !== 'compra' || item.status !== 'comprado' || item.area === 'trabajo' || item.archived) continue;
    const ends = typeof item.data.warrantyEndsAt === 'string' ? item.data.warrantyEndsAt : null;
    if (!ends) continue;
    const days = daysBetween(today, ends);
    if (days < 0 || days > WARRANTY_WINDOW_DAYS) continue;
    if (item.snoozedUntil && Date.parse(item.snoozedUntil) > now.getTime()) continue;
    add('garantia', `item:${item.id}`, item.id, item.title, `La garantía termina ${days === 0 ? 'hoy' : `en ${plural(days, 'día', 'días')}`}`, ends, itemHref(item), item.snoozeCount);
  }

  // Dates close by with no gift bought.
  const close = input.upcoming.filter((u) => u.daysUntil <= DATE_WINDOW_DAYS && u.person.relation !== 'trabajo');
  for (const o of occasionsWithGifts(close, input.items.filter((i) => i.type === 'regalo' && isOpen(i)), { warnWithinDays: DATE_WINDOW_DAYS })) {
    if (!o.needsGift) continue;
    const u = o.upcoming;
    add('regalo_sin_comprar', `date:${u.person.id}:${u.date}`, null, `Regalo para ${u.person.name}`, `${u.label} ${countdown(u.daysUntil)} · sin regalo comprado`, u.date, `/personas/${u.person.id}`);
  }

  out.sort((a, b) => a.rank - b.rank || Date.parse(a.since) - Date.parse(b.since));
  return out.map((c) => ({
    subject: c.subject,
    itemId: c.itemId,
    kind: c.kind,
    urgent: c.urgent,
    rank: c.rank,
    title: c.title,
    href: c.href,
    detail: c.detail,
    askArchive: c.askArchive,
  }));
}

/**
 * The one to send now: the most urgent first. Among what is merely forgotten it avoids the kind of
 * the last notices (no three ideas in a row) when there is something else; if not, it still sends.
 */
export function pickCandidate(candidates: Candidate[], recentKinds: string[]): Candidate | null {
  if (candidates.length === 0) return null;
  const urgent = candidates.filter((c) => c.urgent);
  if (urgent.length) return urgent[0];
  const last = recentKinds[0];
  return candidates.find((c) => c.kind !== last) ?? candidates[0];
}
