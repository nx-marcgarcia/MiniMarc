/**
 * The weekly review (GTD): empty the Bandeja, look at every active project's next step, deal with
 * what is overdue, rescue what was forgotten and glance at next week. Pure.
 */
import { addDays, parseWeekParam } from '@/lib/agenda/week';
import type { Project } from '@/lib/db/projects';
import type { Item } from '@/lib/db/types';
import { isOpen } from '@/lib/items/itemTypes';
import { projectSummary } from '@/lib/projects';
import { deadlineOf } from '@/lib/tareas';
import { IDEA_STALE_DAYS, LINK_STALE_DAYS } from '@/lib/resurfacing/candidates';
import { madridDateTime, madridToUtc } from '@/lib/time';

export const REVIEW_KEY = 'revision-semanal';
export const RESCUE_MAX = 10;
export const TIDY_MAX = 10;
const DAY = 86_400_000;

export type Review = {
  inbox: number;
  projects: { project: Project; nextTask: Item | null }[];
  overdue: Item[];
  rescue: Item[];
  /** Old data that looks misplaced: ideas that read like a loose action, and purchases with no store. */
  tidy: { looseIdeas: Item[]; noStore: number };
  /** Monday of next week, "YYYY-MM-DD". */
  nextWeekStart: string;
};

/**
 * An idea that is really a loose action ("Trabajar", "llamar al médico"): up to three words, the
 * first an infinitive, and nothing else filled in. Deliberately loose; the review only asks.
 */
export function looksLikeLooseAction(item: Item): boolean {
  if (item.type !== 'idea' || item.status !== 'semilla' || item.needsReview || item.projectId) return false;
  if (item.notes?.trim() || item.link) return false;
  if (['category', 'potential', 'nextStep'].some((k) => item.data[k])) return false;
  const words = item.title.trim().split(/\s+/);
  return words.length <= 3 && /^[\p{L}]{3,}(ar|er|ir|arse|erse|irse)$/iu.test(words[0]);
}

const pastDeadline = (i: Item, today: string) => {
  const d = deadlineOf(i);
  return d !== null && d < today;
};
/** What a late task is sorted by: its planned date, else its deadline. */
const overdueKey = (i: Item) => i.dueAt ?? `${deadlineOf(i) ?? ''}T00:00:00.000Z`;

const ageDays = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(iso)) / DAY);

export function buildReview(input: { items: Item[]; projects: Project[]; now: Date; tz: string }): Review {
  const { items, projects, now, tz } = input;
  const today = madridDateTime(now, tz).date;
  const dayStart = madridToUtc(today, '00:00', tz).getTime();
  const open = items.filter((i) => isOpen(i) && !i.needsReview);
  const stale = (i: Item) =>
    (i.type === 'idea' && (i.status === 'semilla' || i.status === 'explorando') && ageDays(i.updatedAt, now) >= IDEA_STALE_DAYS) ||
    (i.type === 'enlace' && i.status === 'por_ver' && ageDays(i.createdAt, now) > LINK_STALE_DAYS);
  return {
    inbox: items.filter((i) => i.needsReview && isOpen(i)).length,
    projects: projects
      .filter((p) => p.status === 'activo')
      .map((project) => ({ project, nextTask: projectSummary(open.filter((i) => i.projectId === project.id)).nextTask })),
    // Past its planned date, or past its deadline whatever the planned date.
    overdue: open
      .filter((i) => i.type === 'tarea' && ((i.dueAt && Date.parse(i.dueAt) < dayStart) || pastDeadline(i, today)))
      .sort((a, b) => overdueKey(a).localeCompare(overdueKey(b))),
    rescue: open
      .filter(stale)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, RESCUE_MAX),
    tidy: {
      looseIdeas: open.filter(looksLikeLooseAction).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, TIDY_MAX),
      noStore: open.filter((i) => i.type === 'compra' && !i.storeId).length,
    },
    nextWeekStart: addDays(parseWeekParam(undefined, today), 7),
  };
}

/** Hoy reminds of the review on Mondays (Madrid) when it was never done or more than 6 days ago. */
export function reviewDue(last: string | null, now: Date, tz: string): boolean {
  const today = madridDateTime(now, tz).date;
  const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
  if (!monday) return false;
  return last === null || now.getTime() - Date.parse(last) > 6 * DAY;
}
