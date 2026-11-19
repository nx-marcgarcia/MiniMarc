/**
 * The words and buttons of the notices (Telegram, Web Push and "Para hoy" share them): the daily
 * briefing, one reminder, the inline keyboard and how its callbacks are read back. Pure, no
 * server imports. Nothing from Trabajo is named: only counts.
 */
import type { Digest } from '@/lib/digest/build';
import { ACTIONS, type ResurfaceAction } from '@/lib/db/resurfacing';
import { countdown, dateWithPerson } from '@/lib/people/format';
import type { Candidate, CandidateKind } from './candidates';

export const KIND_LABELS: Record<CandidateKind, string> = {
  atrasada: 'Atrasada',
  vence_hoy: 'Para hoy',
  regalo_sin_comprar: 'Regalo pendiente',
  garantia: 'Garantía',
  compra_urgente: 'Compra urgente',
  idea_olvidada: 'Idea olvidada',
  enlace_olvidado: 'Enlace sin ver',
  libro_pendiente: 'Libro por leer',
  seguimiento: 'Seguimiento',
  con_hora: 'Ahora',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const MAX_DATES = 3;
const BOUGHT = ['comprado', 'envuelto'];

/**
 * The briefing as lines of plain text: the day's headline, what is due, the next dates, the
 * Bandeja and one thing rescued. A day with nothing to say is the headline alone.
 */
export function briefingLines(d: Digest, rescued: Candidate | null): string[] {
  const lines = [d.headline];
  const personal = d.tasks.personal.items.length + d.tasks.personal.more;
  const work = d.tasks.trabajo.items.length + d.tasks.trabajo.more;
  const overdue = d.tasks.personal.items.filter((t) => t.overdue).length;

  const today: string[] = [];
  if (personal) today.push(plural(personal, 'tarea', 'tareas') + (overdue ? ` (${plural(overdue, 'atrasada', 'atrasadas')})` : ''));
  if (d.events.length) today.push(plural(d.events.length, 'cita', 'citas'));
  if (work) today.push(`${work} de Trabajo`);
  if (today.length) lines.push(`Hoy: ${today.join(' · ')}`);

  if (d.dates.length) {
    const parts = d.dates.slice(0, MAX_DATES).map((x) => {
      const missing = !x.giftIdeas.some((g) => BOUGHT.includes(g.status));
      return `${dateWithPerson(x)} ${countdown(x.daysUntil)}${missing ? ' (sin regalo comprado)' : ''}`;
    });
    lines.push(`Fechas: ${parts.join(' · ')}`);
  }
  if (d.unclassified) lines.push(`Bandeja: ${d.unclassified} por revisar`);
  if (rescued) lines.push(`Rescatado: «${rescued.title}» · ${rescued.detail}`);
  return lines;
}

/** One reminder: what kind, which thing, why now (and the question when it was postponed 3 times). */
export function reminderLines(c: Candidate): string[] {
  const lines = [KIND_LABELS[c.kind], `«${c.title}»`, c.detail];
  if (c.askArchive) lines.push('Lo has pospuesto 3 veces. ¿Lo archivo?');
  return lines;
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };

/**
 * Hecho · Posponer 1 semana · Archivar · Abrir. What is not an item (a person's date) can only be
 * postponed or opened. `href` is where Abrir goes inside the app.
 */
export function reminderButtons(eventId: string, c: Candidate, opts: { appUrl: string; href: string }): InlineButton[][] {
  const cb = (text: string, action: ResurfaceAction): InlineButton => ({ text, callback_data: `r:${eventId}:${action}` });
  const open: InlineButton = { text: 'Abrir', url: `${opts.appUrl.replace(/\/+$/, '')}${opts.href}` };
  if (!c.itemId) return [[cb('Posponer 1 semana', 'posponer'), open]];
  return [[cb('Hecho', 'hecho'), cb('Posponer 1 semana', 'posponer'), cb('Archivar', 'archivar'), open]];
}

/** `r:<eventId>:<action>` back into its parts; anything else is null. */
export function parseCallback(data: string): { eventId: string; action: ResurfaceAction } | null {
  const [prefix, eventId, action, ...rest] = data.split(':');
  if (prefix !== 'r' || !eventId || rest.length > 0) return null;
  return (ACTIONS as readonly string[]).includes(action ?? '') && action !== 'abrir' ? { eventId, action: action as ResurfaceAction } : null;
}

/** For Telegram's HTML parse mode. */
export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
