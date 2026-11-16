/**
 * The weekly review (GTD): empty the Bandeja, look at every active project's next step, deal with
 * what is overdue, rescue what was forgotten and glance at next week. Pure.
 */
import { addDays, parseWeekParam } from '@/lib/agenda/week';
import type { Project } from '@/lib/db/projects';
import type { Item } from '@/lib/db/types';
import { isOpen } from '@/lib/items/itemTypes';
import { projectSummary } from '@/lib/projects';
import { IDEA_STALE_DAYS, LINK_STALE_DAYS } from '@/lib/resurfacing/candidates';
import { madridDateTime, madridToUtc } from '@/lib/time';

export const REVIEW_KEY = 'revision-semanal';
export const RESCUE_MAX = 10;
const DAY = 86_400_000;

export type Review = {
  inbox: number;
  projects: { project: Project; nextTask: Item | null }[];
  overdue: Item[];
  rescue: Item[];
  /** Monday of next week, "YYYY-MM-DD". */
  nextWeekStart: string;
};

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
    overdue: open
      .filter((i) => i.type === 'tarea' && i.dueAt && Date.parse(i.dueAt) < dayStart)
      .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!)),
    rescue: open
      .filter(stale)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, RESCUE_MAX),
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
