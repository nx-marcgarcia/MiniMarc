import { describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';

function setup() {
  const backend = createMemoryBackend();
  return { backend, people: createPeopleRepo(backend) };
}

describe('upsertPersonByName: la misma persona, escrita de otra manera', () => {
  it.each([
    ['con acento donde no lo había', 'Mama', 'mamá'],
    ['sin acento donde lo había', 'mamá', 'Mama'],
    ['en mayúsculas', 'Ainhoa', 'AINHOA'],
    ['con espacios de más', 'Ana', '  Ana  '],
    ['con espacios dobles dentro', 'Ana María', 'Ana  María'],
  ])('%s', async (_name, first, second) => {
    const { people } = setup();
    const a = await people.upsertPersonByName(first);
    const b = await people.upsertPersonByName(second);
    expect(b.id).toBe(a.id);
    expect((await people.listPeople())).toHaveLength(1);
  });

  it('conserva el nombre con el que se creó, no lo reescribe', async () => {
    const { people } = setup();
    await people.upsertPersonByName('mamá');
    const again = await people.upsertPersonByName('MAMA');
    expect(again.name).toBe('mamá');
  });

  it('nombres distintos siguen siendo personas distintas', async () => {
    const { people } = setup();
    const ana = await people.upsertPersonByName('Ana');
    const ano = await people.upsertPersonByName('Ano');
    expect(ano.id).not.toBe(ana.id);
    expect(await people.listPeople()).toHaveLength(2);
  });

  it('un nombre vacío o solo espacios lanza', async () => {
    const { people } = setup();
    await expect(people.upsertPersonByName('   ')).rejects.toThrow();
  });
});

describe('ficha ampliada de la persona', () => {
  it('una persona nueva trae la ficha vacía', async () => {
    const { people } = setup();
    const p = await people.upsertPersonByName('Rosendo');
    expect(p).toMatchObject({ alias: [], relation: null, likes: null, sizes: {}, dislikes: null, contact: {} });
  });

  it('se encuentra por alias: "papá" es Rosendo', async () => {
    const { people } = setup();
    const rosendo = await people.upsertPersonByName('Rosendo');
    await people.updatePerson(rosendo.id, { alias: ['Papá', 'padre'] });
    expect((await people.upsertPersonByName('PAPA')).id).toBe(rosendo.id);
    expect((await people.upsertPersonByName('padre')).id).toBe(rosendo.id);
    expect(await people.listPeople()).toHaveLength(1);
  });

  it('guarda relación, gustos, tallas, lo que no le gusta y el contacto', async () => {
    const { people } = setup();
    const p = await people.upsertPersonByName('Aina');
    const up = await people.updatePerson(p.id, {
      relation: 'amigo',
      likes: 'Los relojes, el té',
      dislikes: 'El perfume',
      sizes: { camiseta: 'M', zapatos: '42' },
      contact: { email: 'aina@example.com', phone: '+34 600 000 000' },
    });
    expect(up).toMatchObject({
      relation: 'amigo',
      likes: 'Los relojes, el té',
      dislikes: 'El perfume',
      sizes: { camiseta: 'M', zapatos: '42' },
      contact: { email: 'aina@example.com', phone: '+34 600 000 000' },
    });
  });

  it('rechaza una relación desconocida y un email que no lo es', async () => {
    const { people } = setup();
    const p = await people.upsertPersonByName('Aina');
    await expect(people.updatePerson(p.id, { relation: 'vecino' as never })).rejects.toThrow();
    await expect(people.updatePerson(p.id, { contact: { email: 'no-es-email' } })).rejects.toThrow();
  });

  it('los alias se guardan sin repetir ni vacíos', async () => {
    const { people } = setup();
    const p = await people.upsertPersonByName('Aina');
    const up = await people.updatePerson(p.id, { alias: ['Ai', ' ai ', '', 'Ainita'] });
    expect(up.alias).toEqual(['Ai', 'Ainita']);
  });
});
