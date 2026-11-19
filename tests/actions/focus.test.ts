import { beforeEach, describe, expect, it } from 'vitest';
import { setFocus } from '@/lib/actions/focus';
import { UserError } from '@/lib/actions/result';
import { createItemsRepo, type ItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';

const TODAY = '2026-11-17';
let items: ItemsRepo;
beforeEach(() => {
  items = createItemsRepo(createMemoryBackend());
});
const task = (title: string, over = {}) => items.createItem({ type: 'tarea', title, area: 'personal', ...over });
const focused = async () => (await items.listItems({ type: 'tarea' })).filter((i) => i.data.focusOn === TODAY).map((i) => i.title);

describe('setFocus', () => {
  it('marca la tarea elegida para hoy sin tocar el resto de sus datos', async () => {
    const a = await task('A', { data: { deadline: '2026-11-30' } });
    await setFocus({ items }, a.id, TODAY);
    const [saved] = await items.listItems({ type: 'tarea' });
    expect(saved.data).toMatchObject({ deadline: '2026-11-30', focusOn: TODAY });
  });

  it('solo hay una: elegir otra quita la anterior', async () => {
    const a = await task('A');
    const b = await task('B');
    await setFocus({ items }, a.id, TODAY);
    await setFocus({ items }, b.id, TODAY);
    expect(await focused()).toEqual(['B']);
  });

  it('null la quita, y elegir la misma otra vez no falla', async () => {
    const a = await task('A');
    await setFocus({ items }, a.id, TODAY);
    await setFocus({ items }, a.id, TODAY);
    expect(await focused()).toEqual(['A']);
    await setFocus({ items }, null, TODAY);
    expect(await focused()).toEqual([]);
  });

  it('una marca de otro día no se toca', async () => {
    const old = await task('Vieja', { data: { focusOn: '2026-11-10' } });
    const a = await task('A');
    await setFocus({ items }, a.id, TODAY);
    expect((await items.listItems({ type: 'tarea' })).find((i) => i.id === old.id)?.data.focusOn).toBe('2026-11-10');
  });

  it('no se puede elegir una tarea que no existe, está hecha o en espera', async () => {
    const waiting = await task('Espera', { status: 'en_espera' });
    const done = await task('Hecha', { status: 'hecha' });
    await expect(setFocus({ items }, 'nada', TODAY)).rejects.toThrow(UserError);
    await expect(setFocus({ items }, waiting.id, TODAY)).rejects.toThrow('Esa tarea está en espera.');
    await expect(setFocus({ items }, done.id, TODAY)).rejects.toThrow(UserError);
  });
});
