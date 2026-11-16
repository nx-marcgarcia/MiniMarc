/**
 * What Marc does after a capture, from the toast: correct what the AI understood with the chips
 * (type, person, store), or undo the whole capture. Every correction is written to the
 * classification log (0012): they are the real examples the prompt is improved with.
 * Pure over injected repos; app/actions/captureFollowUp.ts binds them to the session.
 */
import { deleteAgendaEvent, PRIMARY_CALENDAR, type EventDeps } from '@/lib/actions/events';
import { deleteItem, moveItem, type ActionDeps, type MovePatch } from '@/lib/actions/items';
import type { CaptureLogRepo } from '@/lib/db/captureLog';
import type { StoresRepo } from '@/lib/db/stores';
import type { Item, ItemType } from '@/lib/db/types';

export interface FollowUpDeps extends ActionDeps, Partial<EventDeps> {
  stores: StoresRepo;
  log?: CaptureLogRepo;
}

export interface CorrectionPatch {
  type?: ItemType;
  /** An existing person (null removes it), or `personName` for one by name (created if new). */
  personId?: string | null;
  personName?: string;
  storeId?: string | null;
  storeName?: string;
}

export async function correctCaptured(
  deps: FollowUpDeps,
  input: { logId?: string; itemId: string; patch: CorrectionPatch },
): Promise<Item> {
  const current = (await deps.items.listItems()).find((i) => i.id === input.itemId);
  if (!current) throw new Error('El elemento ya no existe');
  const { patch: p } = input;

  const patch: MovePatch = {};
  const changes: { field: string; from: unknown; to: unknown }[] = [];

  if (p.type && p.type !== current.type) {
    // Choosing a type is accepting a classification: out of the Bandeja, suggestion done.
    Object.assign(patch, { type: p.type, needsReview: false, suggestion: null });
    changes.push({ field: 'type', from: current.type, to: p.type });
  }
  const personId = p.personName?.trim() ? (await deps.people.upsertPersonByName(p.personName)).id : p.personId;
  if (personId !== undefined && personId !== current.personId) {
    patch.personId = personId;
    changes.push({ field: 'personId', from: current.personId, to: personId });
  }
  const storeId = p.storeName?.trim() ? (await deps.stores.upsertStoreByName(p.storeName)).id : p.storeId;
  if (storeId !== undefined && storeId !== current.storeId) {
    patch.storeId = storeId;
    changes.push({ field: 'storeId', from: current.storeId, to: storeId });
  }
  if (changes.length === 0) return current;

  const updated = await moveItem(deps, input.itemId, patch);
  if (input.logId && deps.log) {
    for (const c of changes) {
      try {
        await deps.log.addCorrection(input.logId, { itemId: input.itemId, ...c });
      } catch {
        // The log is an extra: the correction is already made.
      }
    }
  }
  return updated;
}

/**
 * Undo: the items the capture made go to the Papelera (30 days to get them back) and its citas are
 * deleted from Calendar. What cannot be undone does not stop the rest: `eventsFailed` says how many
 * citas stayed in Calendar.
 */
export async function undoCaptured(
  deps: FollowUpDeps,
  input: { itemIds: string[]; eventIds: string[] },
): Promise<{ deleted: number; eventsFailed: number }> {
  let deleted = 0;
  for (const id of input.itemIds) {
    try {
      await deleteItem(deps, id);
      deleted++;
    } catch {
      // Already gone.
    }
  }
  let eventsFailed = 0;
  for (const eventId of input.eventIds) {
    try {
      if (!deps.calendar) throw new Error('sin Calendar');
      const r = await deleteAgendaEvent({ calendar: deps.calendar }, { eventId, calendarId: PRIMARY_CALENDAR });
      if (!r.ok) eventsFailed++;
    } catch {
      eventsFailed++;
    }
  }
  return { deleted, eventsFailed };
}
