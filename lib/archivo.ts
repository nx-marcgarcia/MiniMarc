/** Archivo (the Logbook): what was finished or archived, by month in Madrid. Pure. */
import type { Item } from '@/lib/db/types';
import { madridDateTime } from '@/lib/time';

export const ARCHIVO_LIMIT = 200;

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** When it left the lists: completed, or else last touched (an archived item). */
export const closedAt = (i: Pick<Item, 'completedAt' | 'updatedAt'>) => i.completedAt ?? i.updatedAt;

export function groupArchivo(items: Item[]): { key: string; header: string; items: Item[] }[] {
  const sorted = [...items].sort((a, b) => closedAt(b).localeCompare(closedAt(a)));
  const groups = new Map<string, Item[]>();
  for (const item of sorted) {
    const key = madridDateTime(new Date(closedAt(item))).date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([key, list]) => {
    const [year, month] = key.split('-');
    return { key, header: `${MONTHS[Number(month) - 1]} de ${year}`, items: list };
  });
}
