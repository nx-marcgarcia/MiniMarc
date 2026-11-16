/**
 * Libros: reading states, their labels and the order a book moves through them.
 * No server imports: used by the screen (client), the actions and the capture.
 */
import type { ReadingState } from '@/lib/db/types';

/** The three the screen has tabs for. 'abandonado' exists as a state (registry) but has no tab yet (phase 3). */
export const READING_STATES = ['por_leer', 'leyendo', 'leido'] as const satisfies readonly ReadingState[];

// A libro's status IS its reading state (lib/items/itemTypes.ts); archiving is the `archived` flag,
// which keeps the state.

/** Segmented control and sheet labels. */
export const READING_LABELS: Record<ReadingState, string> = {
  por_leer: 'Por leer',
  leyendo: 'Leyendo',
  leido: 'Leídos',
  abandonado: 'Abandonados',
};

/** Swipe or tap: por leer → leyendo → leído; a read book goes back to "por leer" (releer). */
export function nextReadingState(state: ReadingState | null): ReadingState {
  if (state === 'por_leer' || state === null) return 'leyendo';
  if (state === 'leyendo') return 'leido';
  return 'por_leer';
}

/** What the "next" button and the swipe say for a book in this state. */
export const NEXT_ACTION_LABELS: Record<ReadingState, string> = {
  por_leer: 'Empezar',
  leyendo: 'Terminado',
  leido: 'Releer',
  abandonado: 'Retomar',
};

/** Quiet text when a state has no books. */
export const EMPTY_TEXT: Record<ReadingState, string> = {
  por_leer: 'No hay libros en espera.',
  leyendo: 'Ahora mismo no estás leyendo ninguno.',
  leido: 'Aquí aparecerán los libros que termines.',
  abandonado: 'Aquí irán los libros que dejes a medias.',
};

export function isReadingState(v: string): v is ReadingState {
  return (READING_STATES as readonly string[]).includes(v) || v === 'abandonado';
}

/**
 * The href for a book's link: http(s) as is; a bare "www.casadellibro.com/…" gets https://;
 * any other scheme (javascript:, data:…) gets no link at all.
 */
export function linkHref(link: string | null): string | null {
  const v = link?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
  return `https://${v}`;
}
