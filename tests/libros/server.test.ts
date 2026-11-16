import { describe, expect, it } from 'vitest';
import { withServerBookInfo, type ServerBookDeps } from '@/lib/books/server';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';

function setup(store: ServerBookDeps['store']) {
  const tasks: (() => Promise<void>)[] = [];
  const invalidated: string[] = [];
  const deps: ServerBookDeps = {
    after: (t) => void tasks.push(t),
    store,
    invalidate: (userId) => void invalidated.push(userId),
  };
  return { repo: withServerBookInfo(createItemsRepo(createMemoryBackend()), 'u1', deps), tasks, invalidated };
}

describe('withServerBookInfo', () => {
  it('no hace nada durante el guardado: la búsqueda queda para después de la respuesta', async () => {
    let stored = 0;
    const { repo, tasks } = setup(async () => (stored++, true));
    await repo.createItem({ type: 'libro', title: 'Dune' });
    expect(stored).toBe(0);
    expect(tasks).toHaveLength(1);
  });

  it('después guarda y caduca la caché del usuario', async () => {
    const { repo, tasks, invalidated } = setup(async () => true);
    await repo.createItem({ type: 'libro', title: 'Dune' });
    await tasks[0]();
    expect(invalidated).toEqual(['u1']);
  });

  it('si no se guardó nada no caduca la caché', async () => {
    const { repo, tasks, invalidated } = setup(async () => false);
    await repo.createItem({ type: 'libro', title: 'Dune' });
    await tasks[0]();
    expect(invalidated).toEqual([]);
  });

  it('si la búsqueda lanza, no sale a la luz', async () => {
    const { repo, tasks } = setup(async () => {
      throw new Error('boom');
    });
    await repo.createItem({ type: 'libro', title: 'Dune' });
    await expect(tasks[0]()).resolves.toBeUndefined();
  });
});
