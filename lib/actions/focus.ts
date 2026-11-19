/**
 * "Mi prioridad de hoy": one open task carries `data.focusOn` = today. Choosing another one
 * takes it off the previous; passing null clears it. A stale `focusOn` (an earlier day) means nothing.
 */
import { UserError } from '@/lib/actions/result';
import type { ItemsRepo } from '@/lib/db/items';
import { isWaiting } from '@/lib/tareas';

export async function setFocus(deps: { items: ItemsRepo }, id: string | null, today: string): Promise<void> {
  const tasks = await deps.items.listItems({ type: 'tarea', open: true });
  for (const t of tasks) {
    if (t.data.focusOn !== today || t.id === id) continue;
    const data = { ...t.data };
    delete data.focusOn;
    await deps.items.updateItem(t.id, { data });
  }
  if (id === null) return;
  const item = tasks.find((i) => i.id === id);
  if (!item) throw new UserError('No encuentro esa tarea.');
  if (isWaiting(item)) throw new UserError('Esa tarea está en espera.');
  if (item.data.focusOn !== today) await deps.items.updateItem(id, { data: { ...item.data, focusOn: today } });
}
