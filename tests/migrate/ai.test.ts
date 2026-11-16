import { describe, expect, it } from 'vitest';
import type { AiProvider } from '@/lib/ai/provider';
import { cachedAi, createMigrationAi } from '@/lib/migrate/ai';
import type { MigrationAi } from '@/lib/migrate/plan';

/** Un proveedor que devuelve una respuesta fija y guarda los prompts que ha recibido. */
function provider(answer: unknown) {
  const prompts: string[] = [];
  const p: AiProvider = {
    async generateJson(prompt, schema) {
      prompts.push(prompt);
      return schema.parse(answer);
    },
    async generateText() {
      throw new Error('no se usa');
    },
  };
  return { p, prompts };
}

describe('createMigrationAi', () => {
  it('splitCompra devuelve tienda y productos normalizados (los null que faltan)', async () => {
    const { p, prompts } = provider({
      store: { name: 'Aliexpress', domain: 'aliexpress.com' },
      products: [{ title: 'Masaje de cabeza' }, { title: 'Cajón organizador', price: 9.5 }],
    });
    const out = await createMigrationAi(p).splitCompra({ title: 'Aliexpress', notes: 'masaje de cabeza, cajón', link: null, linkTitle: null });
    expect(out.store).toEqual({ name: 'Aliexpress', domain: 'aliexpress.com' });
    expect(out.products).toEqual([
      { title: 'Masaje de cabeza', link: null, price: null, notes: null },
      { title: 'Cajón organizador', link: null, price: 9.5, notes: null },
    ]);
    // El texto del usuario va entre comillas, tratado como dato.
    expect(prompts[0]).toContain('"""Aliexpress"""');
  });

  it('splitCompra sin tienda devuelve store null', async () => {
    const { p } = provider({ products: [{ title: 'Leche' }] });
    expect((await createMigrationAi(p).splitCompra({ title: 'Leche', notes: null, link: null, linkTitle: null })).store).toBeNull();
  });

  it('giftsFromNotes devuelve los regalos y las notas que sobran', async () => {
    const { p } = provider({ gifts: [{ title: 'Caja para relojes' }], remainingNotes: 'Le gusta el té' });
    expect(await createMigrationAi(p).giftsFromNotes({ name: 'Rosendo', notes: 'Caja reloj buen regalo. Le gusta el té' })).toEqual({
      gifts: [{ title: 'Caja para relojes', approxPrice: null, link: null }],
      remainingNotes: 'Le gusta el té',
    });
  });

  it('checkIdea acepta una sugerencia de tipo conocido y descarta una que no lo es', async () => {
    const ok = provider({ isIdea: false, confidence: 0.9, suggestion: 'tarea' });
    expect(await createMigrationAi(ok.p).checkIdea({ title: 'Trabajar', notes: null })).toEqual({ isIdea: false, confidence: 0.9, suggestion: 'tarea' });
    const odd = provider({ isIdea: false, confidence: 0.9, suggestion: 'viaje' });
    expect((await createMigrationAi(odd.p).checkIdea({ title: 'x', notes: null })).suggestion).toBeNull();
  });

  it('una respuesta que no encaja con el esquema falla', async () => {
    const { p } = provider({ products: 'no es una lista' });
    await expect(createMigrationAi(p).splitCompra({ title: 'x', notes: null, link: null, linkTitle: null })).rejects.toThrow();
  });
});

describe('cachedAi', () => {
  it('la segunda vez con la misma pregunta no llama a la IA', async () => {
    let calls = 0;
    const inner: MigrationAi = {
      async splitCompra() {
        calls++;
        return { store: null, products: [{ title: 'Leche', link: null, price: null, notes: null }] };
      },
      async giftsFromNotes() {
        calls++;
        return { gifts: [], remainingNotes: '' };
      },
      async checkIdea() {
        calls++;
        return { isIdea: true, confidence: 1, suggestion: null };
      },
    };
    const store = new Map<string, unknown>();
    let saved = 0;
    const ai = cachedAi(inner, store, () => saved++);
    const q = { title: 'Leche', notes: null, link: null, linkTitle: null };
    await ai.splitCompra(q);
    await ai.splitCompra(q);
    expect(calls).toBe(1);
    expect(saved).toBe(1);
    await ai.splitCompra({ ...q, title: 'Pan' });
    expect(calls).toBe(2);
    // Una caché cargada de disco vale igual.
    const again = cachedAi(inner, new Map(store), () => {});
    await again.splitCompra(q);
    expect(calls).toBe(2);
  });

  it('un fallo no se guarda en la caché', async () => {
    let n = 0;
    const inner: MigrationAi = {
      async splitCompra() {
        n++;
        if (n === 1) throw new Error('cuota');
        return { store: null, products: [{ title: 'Leche', link: null, price: null, notes: null }] };
      },
      giftsFromNotes: async () => ({ gifts: [], remainingNotes: '' }),
      checkIdea: async () => ({ isIdea: true, confidence: 1, suggestion: null }),
    };
    const ai = cachedAi(inner, new Map(), () => {});
    const q = { title: 'Leche', notes: null, link: null, linkTitle: null };
    await expect(ai.splitCompra(q)).rejects.toThrow();
    await expect(ai.splitCompra(q)).resolves.toBeTruthy();
  });
});
