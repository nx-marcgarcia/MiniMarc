/**
 * Aplica un plan de migración (lib/migrate/plan.ts) sobre la base de datos, a través de los
 * repositorios, así que todo lo que se escribe pasa por la validación del registro de tipos.
 *
 * Repetible: los ids de lo que se crea son deterministas y `createItem` con un id que ya existe
 * devuelve el item; los enlaces no se repiten; fusionar una persona que ya no está no hace nada.
 * Una operación que falla se anota y no detiene las demás.
 *
 * Antes de las operaciones traduce los estados antiguos que haya guardados (pendiente → estado
 * inicial del tipo, hecho → su estado de completar, archivado → archived, reading_state de los
 * libros → status). Nunca borra un item: lo separado se archiva.
 */
import type { DbBackend } from '@/lib/db/backend';
import { rowToItem, type ItemsRepo } from '@/lib/db/items';
import type { LinksRepo } from '@/lib/db/links';
import type { PeopleRepo } from '@/lib/db/people';
import type { StoresRepo } from '@/lib/db/stores';
import type { ItemPatch } from '@/lib/db/types';
import { isItemType, normalizeLegacyStatus } from '@/lib/items/itemTypes';
import type { Op, Plan, StoreRef } from './plan';

export interface ApplyDeps {
  /** Para leer las filas tal como están guardadas (con sus estados antiguos). */
  backend: DbBackend;
  items: ItemsRepo;
  people: PeopleRepo;
  stores: StoresRepo;
  links: LinksRepo;
}

export interface ApplyResult {
  /** Items cuyo estado antiguo se ha traducido. */
  normalized: number;
  applied: number;
  failed: { op: Op; error: string }[];
}

/** Traduce los estados antiguos guardados. Devuelve cuántos items ha cambiado. */
export async function normalizeStoredStatuses(deps: Pick<ApplyDeps, 'backend' | 'items'>): Promise<number> {
  let changed = 0;
  for (const row of await deps.backend.select('items')) {
    if (!isItemType(row.type)) continue;
    const { status, archived } = normalizeLegacyStatus(row.type, String(row.status ?? 'pendiente'), (row.reading_state as string | null) ?? null);
    const nowArchived = Boolean(row.archived) || archived;
    if (row.status === status && Boolean(row.archived) === nowArchived) continue;
    await deps.items.updateItem(String(row.id), { status, archived: nowArchived });
    changed++;
  }
  return changed;
}

async function storeId(deps: ApplyDeps, store: StoreRef | undefined): Promise<string | undefined> {
  if (!store) return undefined;
  return (await deps.stores.upsertStoreByName(store.name, store.domain ? { domain: store.domain } : undefined)).id;
}

const joinNotes = (...notes: (string | null | undefined)[]) => {
  const out: string[] = [];
  for (const n of notes) if (n?.trim() && !out.includes(n.trim())) out.push(n.trim());
  return out.join('\n') || null;
};

async function applyOp(op: Op, deps: ApplyDeps): Promise<void> {
  switch (op.op) {
    case 'merge-person': {
      const keep = await deps.people.getPerson(op.keep);
      if (!keep) throw new Error('la persona que se queda no existe');
      for (const dropId of op.drop) {
        const drop = await deps.people.getPerson(dropId);
        if (!drop) continue; // ya fusionada
        for (const row of await deps.backend.select('items', { eq: { person_id: dropId } })) {
          await deps.items.updateItem(String(row.id), { personId: op.keep });
        }
        await deps.people.movePersonDates(dropId, op.keep);
        const current = (await deps.people.getPerson(op.keep)) ?? keep;
        await deps.people.updatePerson(op.keep, {
          birthday: current.birthday ?? drop.birthday,
          notes: joinNotes(current.notes, drop.notes),
          alias: [...current.alias, drop.name, ...drop.alias],
        });
        await deps.people.deletePerson(dropId);
      }
      return;
    }
    case 'update-item': {
      const [row] = await deps.backend.select('items', { eq: { id: op.id } });
      if (!row) throw new Error('el item no existe');
      const current = rowToItem(row);
      const patch: ItemPatch = {};
      const p = op.patch;
      if (p.title !== undefined) patch.title = p.title;
      if (p.notes !== undefined) patch.notes = p.notes;
      if (p.status !== undefined) patch.status = p.status;
      if (p.needsReview !== undefined) patch.needsReview = p.needsReview;
      if (p.sourceText !== undefined && !current.sourceText) patch.sourceText = p.sourceText;
      if (p.data !== undefined) patch.data = { ...current.data, ...p.data };
      const sid = await storeId(deps, p.store);
      if (sid) patch.storeId = sid;
      await deps.items.updateItem(op.id, patch);
      return;
    }
    case 'create-item': {
      const i = op.item;
      const sid = await storeId(deps, i.store);
      await deps.items.createItem(
        {
          type: i.type,
          title: i.title,
          notes: i.notes ?? null,
          ...(i.status && { status: i.status }),
          ...(i.personId && { personId: i.personId }),
          ...(sid && { storeId: sid }),
          ...(i.link && { link: i.link }),
          ...(i.sourceText && { sourceText: i.sourceText }),
          ...(i.data && { data: i.data }),
        },
        { id: op.id, createdAt: op.createdAt },
      );
      if (i.link) await deps.links.addLink(op.id, { url: i.link });
      return;
    }
    case 'archive-item':
      await deps.items.updateItem(op.id, { archived: true });
      return;
    case 'add-link':
      await deps.links.addLink(op.itemId, { url: op.url, title: op.title ?? undefined, image: op.image ?? undefined });
      return;
    case 'set-person-notes':
      await deps.people.updatePerson(op.id, { notes: op.notes || null });
      return;
    default: {
      const unknown: never = op;
      throw new Error(`operación desconocida: ${JSON.stringify(unknown)}`);
    }
  }
}

export async function applyPlan(plan: Plan, deps: ApplyDeps): Promise<ApplyResult> {
  const result: ApplyResult = { normalized: await normalizeStoredStatuses(deps), applied: 0, failed: [] };
  for (const op of plan.ops) {
    try {
      await applyOp(op, deps);
      result.applied++;
    } catch (err) {
      result.failed.push({ op, error: err instanceof Error ? err.message : 'error desconocido' });
    }
  }
  return result;
}
