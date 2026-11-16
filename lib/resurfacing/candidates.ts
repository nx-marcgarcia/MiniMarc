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
import { isOpen } from '@/lib/items/itemTypes';
import { countdown } from '@/lib/people/format';
import { occasionsWithGifts } from '@/lib/regalos';
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
  /** One short line: why it came up. */
  detail: string;
  /** Postponed 3 times already: ask whether to archive it. */
  askArchive: boolean;
}

export const REPEAT_AFTER_DAYS = 7;
export const IDEA_STALE_DAYS = 30;
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
  regalo_sin_comprar: 3,
  garantia: 4,
  compra_urgente: 5,
  idea_olvidada: 6,
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
const hace = (days: number) => (days < 60 ? `hace ${plural(days, 'día', 'días')}` : `hace ${plural(Math.floor(days / 30), 'mes', 'meses')}`);

export function findCandidates(input: CandidateInput): Candidate[] {
  const { now, tz } = input;
  const today = madridDateTime(now, tz).date;
  const recent = new Set(input.sent.filter((e) => now.getTime() - Date.parse(e.sentAt) < REPEAT_AFTER_DAYS * DAY).map((e) => e.subject));
  const out: (Candidate & { since: string })[] = [];

  const add = (kind: CandidateKind, subject: string, itemId: string | null, title: string, detail: string, since: string, snoozeCount = 0) => {
    if (recent.has(subject)) return;
    out.push({ subject, itemId, kind, urgent: RANK[kind] <= URGENT_UP_TO, rank: RANK[kind], title, detail, since, askArchive: snoozeCount >= SNOOZES_BEFORE_ASKING });
  };

  for (const item of input.items) {
    if (item.area === 'trabajo' || item.needsReview || item.archived || !isOpen(item)) continue;
    if (item.snoozedUntil && Date.parse(item.snoozedUntil) > now.getTime()) continue;
    const subject = `item:${item.id}`;
    const data = item.data;

    if (item.type === 'tarea' && item.dueAt) {
      const days = daysBetween(today, madridDateTime(new Date(item.dueAt), tz).date);
      if (days < 0) add('atrasada', subject, item.id, item.title, `Venció ${hace(-days)}`, item.dueAt, item.snoozeCount);
      else if (days === 0 && !item.hasTime) add('vence_hoy', subject, item.id, item.title, 'Vence hoy', item.dueAt, item.snoozeCount);
    } else if (item.type === 'idea' && (item.status === 'semilla' || item.status === 'explorando') && ageDays(item.updatedAt, now) >= IDEA_STALE_DAYS) {
      add('idea_olvidada', subject, item.id, item.title, `Sin tocar ${hace(ageDays(item.updatedAt, now))}`, item.updatedAt, item.snoozeCount);
    } else if (item.type === 'enlace' && item.status === 'por_ver' && ageDays(item.createdAt, now) > LINK_STALE_DAYS) {
      add('enlace_olvidado', subject, item.id, item.title, `Guardado ${hace(ageDays(item.createdAt, now))} y sin ver`, item.createdAt, item.snoozeCount);
    } else if (item.type === 'libro' && item.status === 'por_leer' && ageDays(item.createdAt, now) >= BOOK_STALE_DAYS) {
      add('libro_pendiente', subject, item.id, item.title, `Por leer desde ${hace(ageDays(item.createdAt, now))}`, item.createdAt, item.snoozeCount);
    } else if (item.type === 'compra' && (item.status === 'quiero' || item.status === 'en_carrito') && data.urgency === 'alta' && ageDays(item.createdAt, now) >= URGENT_PURCHASE_DAYS) {
      add('compra_urgente', subject, item.id, item.title, `Urgente, en tu lista ${hace(ageDays(item.createdAt, now))}`, item.createdAt, item.snoozeCount);
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
    add('garantia', `item:${item.id}`, item.id, item.title, `La garantía termina ${days === 0 ? 'hoy' : `en ${plural(days, 'día', 'días')}`}`, ends, item.snoozeCount);
  }

  // Dates close by with no gift bought.
  const close = input.upcoming.filter((u) => u.daysUntil <= DATE_WINDOW_DAYS && u.person.relation !== 'trabajo');
  for (const o of occasionsWithGifts(close, input.items.filter((i) => i.type === 'regalo' && isOpen(i)), { warnWithinDays: DATE_WINDOW_DAYS })) {
    if (!o.needsGift) continue;
    const u = o.upcoming;
    add('regalo_sin_comprar', `date:${u.person.id}:${u.date}`, null, `Regalo para ${u.person.name}`, `${u.label} ${countdown(u.daysUntil)} · sin regalo comprado`, u.date);
  }

  out.sort((a, b) => a.rank - b.rank || Date.parse(a.since) - Date.parse(b.since));
  return out.map((c) => ({
    subject: c.subject,
    itemId: c.itemId,
    kind: c.kind,
    urgent: c.urgent,
    rank: c.rank,
    title: c.title,
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
