/**
 * The Bandeja (what the capture was not sure about): what accepting a suggestion does and the
 * keys of the "Procesar" mode. Pure, so the rules are tested without a DOM.
 */
import type { MovePatch } from '@/lib/actions/items';
import type { Item, ItemType } from '@/lib/db/types';
import { ITEM_TYPE_IDS, ITEM_TYPES } from '@/lib/items/itemTypes';

/** Accepting files the item: the chosen type, else the AI's suggestion, else the type it has; out of the Bandeja. */
export function acceptPatch(item: Item, type?: ItemType): MovePatch {
  return { type: type ?? item.suggestion?.type ?? item.type, needsReview: false, suggestion: null };
}

/** Puts the item back in the Bandeja exactly as it was (Deshacer). */
export function undoAcceptPatch(item: Item): MovePatch {
  return { type: item.type, needsReview: true, suggestion: item.suggestion };
}

/** "¿Tarea?" for an item with a suggestion. */
export function suggestionText(item: Item): string | null {
  return item.suggestion ? `¿${ITEM_TYPES[item.suggestion.type].label}?` : null;
}

export type ProcessAction =
  | { kind: 'accept' }
  | { kind: 'discard' }
  | { kind: 'skip' }
  | { kind: 'back' }
  | { kind: 'exit' }
  | { kind: 'type'; type: ItemType };

/**
 * The key → action map of "Procesar": Enter or A accepts, D (or Delete/Backspace) discards, S (or →)
 * skips, ← goes back, Esc leaves, and 1…7 choose the type in the registry's order. Combined with
 * Ctrl, Cmd or Alt it does nothing, so the browser's own shortcuts keep working.
 */
export function processKey(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): ProcessAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case 'Enter':
    case 'a':
    case 'A':
      return { kind: 'accept' };
    case 'd':
    case 'D':
    case 'Delete':
    case 'Backspace':
      return { kind: 'discard' };
    case 's':
    case 'S':
    case 'ArrowRight':
      return { kind: 'skip' };
    case 'ArrowLeft':
      return { kind: 'back' };
    case 'Escape':
      return { kind: 'exit' };
  }
  const n = /^[1-9]$/.test(e.key) ? Number(e.key) : 0;
  const type = ITEM_TYPE_IDS[n - 1];
  return n > 0 && type ? { kind: 'type', type } : null;
}
