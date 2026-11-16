/**
 * What a capture did, in words and per item, for the toast: "2 compras en Aliexpress",
 * "Regalo para Rosendo · Cumpleaños 14 ene · 30 €", "«Trabajar» a la Bandeja (¿tarea?)". Pure: the
 * names of the people and stores come in as data. The per-item part feeds the correction chips.
 */
import type { Item, ItemType, Person } from '@/lib/db/types';
import { ITEM_TYPES } from '@/lib/items/itemTypes';
import { madridDateTime } from '@/lib/time';
import type { CaptureResult } from './pipeline';

export interface Understood {
  id: string;
  type: ItemType;
  title: string;
  needsReview: boolean;
  personId: string | null;
  personName?: string;
  storeId: string | null;
  storeName?: string;
  /** The item this one looks like, if the capture found a repeat. */
  duplicateOf?: string;
}

export interface Described {
  lines: string[];
  items: Understood[];
}

export interface DescribeNames {
  people: Pick<Person, 'id' | 'name' | 'birthday'>[];
  stores: { id: string; name: string }[];
  /** Madrid's "YYYY-MM-DD". */
  today: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** "2026-01-14" → "14 ene". */
const shortDate = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

const LINK_KINDS: Record<string, string> = { video: 'vídeo', short: 'short', articulo: 'artículo', hilo: 'hilo', herramienta: 'herramienta' };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function lineFor(item: Item, names: DescribeNames, person: DescribeNames['people'][number] | undefined): string {
  if (item.needsReview) {
    const suggestion = item.suggestion ? ` (¿${ITEM_TYPES[item.suggestion.type].label.toLowerCase()}?)` : '';
    return `«${item.title}» a la Bandeja${suggestion}`;
  }
  switch (item.type) {
    case 'regalo': {
      if (!person) return 'Regalo sin persona';
      const occasion = typeof item.data.occasion === 'string' ? item.data.occasion : null;
      const when = occasion === 'Cumpleaños' && person.birthday ? ` ${shortDate(person.birthday)}` : '';
      const price = typeof item.data.approxPrice === 'number' ? ` · ${item.data.approxPrice} €` : '';
      return `Regalo para ${person.name}${occasion ? ` · ${occasion}${when}` : ''}${price}`;
    }
    case 'tarea': {
      if (!item.dueAt) return 'Tarea';
      const { date, time } = madridDateTime(new Date(item.dueAt));
      return `Tarea · ${shortDate(date)}${item.hasTime ? ` ${time}` : ''}`;
    }
    case 'libro':
      return `Libro «${item.title}»`;
    case 'enlace': {
      const kind = typeof item.data.kind === 'string' ? LINK_KINDS[item.data.kind] : undefined;
      return kind ? `Enlace · ${kind}` : 'Enlace';
    }
    default:
      return ITEM_TYPES[item.type].label;
  }
}

export function describeCapture(res: CaptureResult, names: DescribeNames): Described {
  const lines: string[] = [];
  const compras = new Map<string, { line: number; count: number; store?: string }>();
  const items: Understood[] = [];

  for (const item of res.items) {
    const person = item.personId ? names.people.find((p) => p.id === item.personId) : undefined;
    const store = item.storeId ? names.stores.find((s) => s.id === item.storeId) : undefined;
    const dup = res.duplicates?.find((d) => d.itemId === item.id);
    items.push({
      id: item.id,
      type: item.type,
      title: item.title,
      needsReview: item.needsReview,
      personId: item.personId,
      ...(person && { personName: person.name }),
      storeId: item.storeId,
      ...(store && { storeName: store.name }),
      ...(dup && { duplicateOf: dup.existingId }),
    });

    if (item.type === 'compra' && !item.needsReview) {
      // Purchases of the same store read as one line: "2 compras en Aliexpress".
      const key = store?.id ?? '';
      const group = compras.get(key);
      if (group) group.count++;
      else {
        compras.set(key, { line: lines.length, count: 1, store: store?.name });
        lines.push('');
      }
      continue;
    }
    lines.push(lineFor(item, names, person));
  }
  for (const g of compras.values()) lines[g.line] = `${plural(g.count, 'compra', 'compras')}${g.store ? ` en ${g.store}` : ''}`;

  if (res.eventIds.length > 0) lines.push(`${plural(res.eventIds.length, 'cita', 'citas')} en Calendar`);
  for (const d of res.dates ?? []) lines.push(`Fecha de ${d.personName} · ${d.label}`);
  return { lines, items };
}
