import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { addGiftIdea, suggestGifts, type GiftIdeaDeps } from '@/lib/giftIdeas';
import { UserError } from '@/lib/actions/result';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';

function setup(answer: unknown | Error) {
  const db = createMemoryBackend();
  const prompts: string[] = [];
  const ai = {
    async generateJson<T>(prompt: string, schema: { parse: (v: unknown) => T }) {
      prompts.push(prompt);
      if (answer instanceof Error) throw answer;
      return schema.parse(answer);
    },
    async generateText() {
      throw new Error('no se usa');
    },
  } as AiProvider;
  const deps: GiftIdeaDeps = { ai, items: createItemsRepo(db), people: createPeopleRepo(db) };
  return { deps, prompts };
}

const person = async (deps: GiftIdeaDeps, name: string, patch: Partial<Person> = {}) => {
  const p = await deps.people.upsertPersonByName(name);
  return Object.keys(patch).length ? deps.people.updatePerson(p.id, patch) : p;
};

const IDEAS = { ideas: [{ title: 'Libro de cocina japonesa', reason: 'Le gusta cocinar', approxPrice: 25 }, { title: 'Delantal', reason: 'Para cocinar' }] };

describe('suggestGifts', () => {
  it('pide ideas con los gustos, lo que no le gusta y lo que ya se le ha regalado', async () => {
    const { deps, prompts } = setup(IDEAS);
    const ana = await person(deps, 'Ana', { likes: 'cocinar, senderismo', dislikes: 'perfumes' });
    await deps.items.createItem({ type: 'regalo', title: 'Cuchillo de chef', personId: ana.id, status: 'entregado', data: { givenYear: 2024 } });
    await suggestGifts(deps, ana.id);
    expect(prompts[0]).toContain('Ana');
    expect(prompts[0]).toContain('cocinar, senderismo');
    expect(prompts[0]).toContain('perfumes');
    expect(prompts[0]).toContain('Cuchillo de chef');
  });

  it('devuelve las sugerencias con motivo y precio aproximado', async () => {
    const { deps } = setup(IDEAS);
    const ana = await person(deps, 'Ana');
    expect(await suggestGifts(deps, ana.id)).toEqual(IDEAS.ideas);
  });

  it('descarta lo que ya está apuntado o entregado para esa persona', async () => {
    const { deps } = setup({ ideas: [{ title: 'cuchillo de chef', reason: 'x' }, { title: 'Delantal', reason: 'y' }] });
    const ana = await person(deps, 'Ana');
    await deps.items.createItem({ type: 'regalo', title: 'Cuchillo de Chef', personId: ana.id, status: 'entregado', data: {} });
    expect((await suggestGifts(deps, ana.id)).map((s) => s.title)).toEqual(['Delantal']);
  });

  it('una persona de Trabajo no se envía a la IA', async () => {
    const { deps, prompts } = setup(IDEAS);
    const jefe = await person(deps, 'Jefe', { relation: 'trabajo' });
    await expect(suggestGifts(deps, jefe.id)).rejects.toThrow(UserError);
    expect(prompts).toHaveLength(0);
  });

  it('si la IA falla, un aviso para Marc y no un error técnico', async () => {
    const { deps } = setup(new Error('quota exceeded'));
    const ana = await person(deps, 'Ana');
    await expect(suggestGifts(deps, ana.id)).rejects.toThrow(UserError);
  });

  it('una persona que no existe es un error claro', async () => {
    const { deps } = setup(IDEAS);
    await expect(suggestGifts(deps, 'no-existe')).rejects.toThrow(UserError);
  });

  it('con la ocasión la menciona en la petición', async () => {
    const { deps, prompts } = setup(IDEAS);
    const ana = await person(deps, 'Ana');
    await suggestGifts(deps, ana.id, 'Cumpleaños');
    expect(prompts[0]).toContain('Cumpleaños');
  });
});

describe('addGiftIdea', () => {
  it('crea el regalo como idea para esa persona, con el motivo y el precio', async () => {
    const { deps } = setup(IDEAS);
    const ana = await person(deps, 'Ana');
    const item = await addGiftIdea(deps, ana.id, { title: 'Libro de cocina japonesa', reason: 'Le gusta cocinar', approxPrice: 25 });
    expect(item).toMatchObject({ type: 'regalo', status: 'idea', personId: ana.id, notes: 'Le gusta cocinar', data: { approxPrice: 25 } });
  });

  it('no inventa un precio cuando no lo hay', async () => {
    const { deps } = setup(IDEAS);
    const ana = await person(deps, 'Ana');
    const item = await addGiftIdea(deps, ana.id, { title: 'Delantal', reason: 'x' });
    expect(item.data).toEqual({});
  });
});
