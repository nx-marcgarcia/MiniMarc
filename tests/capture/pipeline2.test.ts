import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { createCaptureLogRepo } from '@/lib/db/captureLog';
import { createItemsRepo } from '@/lib/db/items';
import { createLinksRepo } from '@/lib/db/links';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createStoresRepo } from '@/lib/db/stores';
import { createTagsRepo } from '@/lib/db/tags';

const NOW = new Date('2026-11-16T09:00:00.000Z');

type ModelItem = Record<string, unknown> & { kind: string; title: string; confidence: number };

function aiReturning(items: ModelItem[]) {
  const prompts: string[] = [];
  const ai: AiProvider = {
    async generateJson<T>(prompt: string, schema: ZodType<T>) {
      prompts.push(prompt);
      return schema.parse({ items });
    },
    async generateText() {
      throw new Error('not used');
    },
  };
  return { ai, prompts };
}

function aiForbidden() {
  const calls: string[] = [];
  const ai: AiProvider = {
    async generateJson(prompt: string) {
      calls.push(prompt);
      throw new Error('AI must not be called');
    },
    async generateText() {
      throw new Error('AI must not be called');
    },
  };
  return { ai, calls };
}

const calendar = async (): Promise<CalendarGateway> => {
  throw new Error('no calendar in these tests');
};

function setup(ai: AiProvider, over: Partial<CaptureDeps> = {}) {
  const db = createMemoryBackend({ now: () => NOW });
  const deps: CaptureDeps = {
    ai,
    items: createItemsRepo(db, { now: () => NOW }),
    people: createPeopleRepo(db),
    stores: createStoresRepo(db),
    links: createLinksRepo(db),
    tags: createTagsRepo(db),
    preview: async () => null,
    calendar,
    now: NOW,
    tz: 'Europe/Madrid',
    ...over,
  };
  return { db, deps };
}

describe('captureText v2 · compras y tiendas', () => {
  it('"Aliexpress: masaje de cabeza, cajón organizador de calcetines" → 2 compras bajo la misma tienda', async () => {
    const { ai } = aiReturning([
      { kind: 'compra', title: 'Masaje de cabeza', store: { name: 'Aliexpress' }, confidence: 0.93 },
      { kind: 'compra', title: 'Cajón organizador de calcetines', store: { name: 'aliexpress' }, confidence: 0.93 },
    ]);
    const { db, deps } = setup(ai);
    const res = await captureText({ text: 'Aliexpress: masaje de cabeza, cajón organizador de calcetines', origin: 'web' }, deps);
    expect(res.items.map((i) => [i.type, i.title])).toEqual([
      ['compra', 'Masaje de cabeza'],
      ['compra', 'Cajón organizador de calcetines'],
    ]);
    const stores = await createStoresRepo(db).listStores();
    expect(stores.map((s) => s.name)).toEqual(['Aliexpress']);
    expect(res.items.map((i) => i.storeId)).toEqual([stores[0].id, stores[0].id]);
    expect(res.items[0]).toMatchObject({ status: 'quiero', needsReview: false, data: { quantity: 1, currency: 'EUR' } });
    expect(res.items[0].sourceText).toBe('Aliexpress: masaje de cabeza, cajón organizador de calcetines');
  });

  it('el precio y la cantidad van a los campos propios de la compra', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Pilas AAA', price: 3.5, currency: 'eur', quantity: 2, confidence: 0.9 }]);
    const { deps } = setup(ai);
    const res = await captureText({ text: 'pilas AAA x2 3,5€', origin: 'web' }, deps);
    expect(res.items[0].data).toEqual({ price: 3.5, currency: 'EUR', quantity: 2 });
  });

  it('las tiendas y los tags existentes no se duplican', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Reloj', store: { name: 'CASIO', domain: 'casio.com' }, tags: ['Reloj', '#regalo'], confidence: 0.9 }]);
    const { db, deps } = setup(ai);
    await createStoresRepo(db).upsertStoreByName('Casio');
    await createTagsRepo(db).upsertTagByName('regalo', '#336699');
    const res = await captureText({ text: 'reloj casio', origin: 'web' }, deps);
    expect(await createStoresRepo(db).listStores()).toHaveLength(1);
    expect((await createStoresRepo(db).listStores())[0].domain).toBe('casio.com');
    expect((await createTagsRepo(db).listTags()).map((t) => t.name).sort()).toEqual(['regalo', 'reloj']);
    expect(res.items[0].tags).toEqual(['reloj', 'regalo']);
  });

  it('al modelo le llegan las tiendas, los tags y las personas con sus alias', async () => {
    const { ai, prompts } = aiReturning([{ kind: 'idea', title: 'x', confidence: 0.9 }]);
    const { db, deps } = setup(ai);
    const rosendo = await createPeopleRepo(db).upsertPersonByName('Rosendo');
    await createPeopleRepo(db).updatePerson(rosendo.id, { alias: ['papá'] });
    await createStoresRepo(db).upsertStoreByName('Casio');
    await createTagsRepo(db).upsertTagByName('viajes');
    await captureText({ text: 'algo', origin: 'web' }, deps);
    expect(prompts[0]).toContain('Rosendo (también: papá)');
    expect(prompts[0]).toContain('Casio');
    expect(prompts[0]).toContain('viajes');
  });

  it('si no se puede crear la tienda, la compra se guarda igual', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Reloj', store: { name: 'Casio' }, confidence: 0.9 }]);
    const { deps } = setup(ai);
    const broken = { ...deps.stores!, upsertStoreByName: async () => { throw new Error('db'); } };
    const res = await captureText({ text: 'reloj casio', origin: 'web' }, { ...deps, stores: broken });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].storeId).toBeNull();
  });

  it('sin repositorios de tiendas, enlaces ni tags la captura sigue funcionando', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Reloj', store: { name: 'Casio' }, tags: ['x'], confidence: 0.9 }]);
    const { deps } = setup(ai, { stores: undefined, links: undefined, tags: undefined, preview: undefined });
    const res = await captureText({ text: 'reloj casio https://casio.com/x', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ title: 'Reloj', storeId: null, tags: [], link: 'https://casio.com/x' });
  });
});

describe('captureText v2 · regalos y personas', () => {
  it('"regalo para Rosendo: caja para relojes, unos 30€" → regalo en su ficha, con precio y su cumpleaños', async () => {
    const { ai } = aiReturning([{ kind: 'regalo', title: 'Caja para relojes', personName: 'Rosendo', price: 30, confidence: 0.96 }]);
    const { db, deps } = setup(ai);
    const rosendo = await createPeopleRepo(db).upsertPersonByName('Rosendo');
    await createPeopleRepo(db).updatePerson(rosendo.id, { birthday: '1960-01-14' });
    const res = await captureText({ text: 'regalo para Rosendo: caja para relojes, unos 30€', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({
      type: 'regalo',
      title: 'Caja para relojes',
      personId: rosendo.id,
      status: 'idea',
      data: { approxPrice: 30, occasion: 'Cumpleaños' },
    });
  });

  it('la ocasión que se dice manda sobre el cumpleaños', async () => {
    const { ai } = aiReturning([{ kind: 'regalo', title: 'Libro', personName: 'Aina', occasion: 'Navidad', confidence: 0.9 }]);
    const { db, deps } = setup(ai);
    const aina = await createPeopleRepo(db).upsertPersonByName('Aina');
    await createPeopleRepo(db).updatePerson(aina.id, { birthday: '1990-05-05' });
    const res = await captureText({ text: 'libro para Aina por Navidad', origin: 'web' }, deps);
    expect(res.items[0].data).toEqual({ occasion: 'Navidad' });
  });

  it('un alias encuentra a la persona: "papá" es Rosendo, no una persona nueva', async () => {
    const { ai } = aiReturning([{ kind: 'regalo', title: 'Cartera', personName: 'papá', confidence: 0.9 }]);
    const { db, deps } = setup(ai);
    const rosendo = await createPeopleRepo(db).upsertPersonByName('Rosendo');
    await createPeopleRepo(db).updatePerson(rosendo.id, { alias: ['papá'] });
    const res = await captureText({ text: 'regalo para papá cartera', origin: 'web' }, deps);
    expect(res.items[0].personId).toBe(rosendo.id);
    expect(await createPeopleRepo(db).listPeople()).toHaveLength(1);
  });
});

describe('captureText v2 · atajos', () => {
  it('#tag, !alta, $precio, @persona y /tipo mandan sobre lo que diga la IA, y la IA no ve los atajos', async () => {
    const { ai, prompts } = aiReturning([{ kind: 'idea', title: 'caja de relojes', confidence: 0.7 }]);
    const { db, deps } = setup(ai);
    const rosendo = await createPeopleRepo(db).upsertPersonByName('Rosendo');
    const text = '/regalo caja de relojes #Regalo !alta $25 @Rosendo';
    const res = await captureText({ text, origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({
      type: 'regalo',
      title: 'caja de relojes',
      priority: 'alta',
      tags: ['regalo'],
      personId: rosendo.id,
      data: { approxPrice: 25 },
      sourceText: text,
    });
    expect(prompts[0]).toContain('caja de relojes');
    expect(prompts[0]).not.toContain('#Regalo');
    expect(prompts[0]).not.toContain('!alta');
  });

  it('un atajo de tipo hace que una idea sea una compra, sin forzar citas ni fechas', async () => {
    const { ai } = aiReturning([{ kind: 'idea', title: 'pilas', confidence: 0.6 }]);
    const { deps } = setup(ai);
    const res = await captureText({ text: '/compra pilas', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ type: 'compra', status: 'quiero', area: null });
  });
});

describe('captureText v2 · ambiguo y dudoso', () => {
  it('"Trabajar" con confianza baja va a la Bandeja, no a Ideas', async () => {
    const { ai } = aiReturning([{ kind: 'idea', title: 'Trabajar', confidence: 0.2 }]);
    const { deps } = setup(ai);
    const res = await captureText({ text: 'Trabajar', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ title: 'Trabajar', needsReview: true });
  });
});

describe('captureText v2 · enlaces sueltos', () => {
  it('un vídeo de YouTube → Enlace de tipo vídeo con título y miniatura, sin llamar a la IA', async () => {
    const { ai, calls } = aiForbidden();
    const preview = async () => ({ title: 'Receta de tortilla', image: 'https://i.ytimg.com/vi/abc/hq.jpg', site: 'YouTube' });
    const { db, deps } = setup(ai, { preview });
    const res = await captureText({ text: 'https://www.youtube.com/watch?v=abc', origin: 'web' }, deps);
    expect(calls).toEqual([]);
    expect(res.items[0]).toMatchObject({
      type: 'enlace',
      title: 'Receta de tortilla',
      status: 'por_ver',
      needsReview: false,
      link: 'https://www.youtube.com/watch?v=abc',
      data: { kind: 'video' },
    });
    const links = await createLinksRepo(db).listLinks(res.items[0].id);
    expect(links).toEqual([expect.objectContaining({ url: 'https://www.youtube.com/watch?v=abc', title: 'Receta de tortilla', image: 'https://i.ytimg.com/vi/abc/hq.jpg', domain: 'youtube.com' })]);
  });

  it('un enlace de una tienda conocida → Compra con la tienda y la vista previa', async () => {
    const { ai, calls } = aiForbidden();
    const preview = async () => ({ title: 'Cafetera Nespresso', image: 'https://m.media-amazon.com/x.jpg', site: 'Amazon' });
    const { db, deps } = setup(ai, { preview });
    const res = await captureText({ text: 'https://www.amazon.es/dp/B0123', origin: 'web' }, deps);
    expect(calls).toEqual([]);
    expect(res.items[0]).toMatchObject({ type: 'compra', title: 'Cafetera Nespresso', status: 'quiero' });
    const store = (await createStoresRepo(db).listStores())[0];
    expect(store).toMatchObject({ name: 'Amazon', domain: 'amazon.es' });
    expect(res.items[0].storeId).toBe(store.id);
  });

  it('un enlace de una tienda que Marc ya tiene (por dominio) → Compra en esa tienda', async () => {
    const { ai, calls } = aiForbidden();
    const { db, deps } = setup(ai);
    const casio = await createStoresRepo(db).upsertStoreByName('Casio', { domain: 'casio.com' });
    const res = await captureText({ text: 'https://www.casio.com/es/watches/MTP-B220BL-1AV/', origin: 'web' }, deps);
    expect(calls).toEqual([]);
    expect(res.items[0]).toMatchObject({ type: 'compra', storeId: casio.id });
  });

  it('sin vista previa, el título es el dominio', async () => {
    const { ai } = aiForbidden();
    const { deps } = setup(ai);
    const res = await captureText({ text: 'https://youtu.be/abc', origin: 'web' }, deps);
    expect(res.items[0].title).toBe('youtu.be');
  });

  it('un dominio desconocido lo decide la IA, que recibe el título de la página', async () => {
    const { ai, prompts } = aiReturning([{ kind: 'enlace', title: 'Cómo montar un blog', linkKind: 'articulo', confidence: 0.9 }]);
    const preview = async () => ({ title: 'Cómo montar un blog', image: null, site: 'Example' });
    const { deps } = setup(ai, { preview });
    const res = await captureText({ text: 'https://blog.example.com/post', origin: 'web' }, deps);
    expect(prompts[0]).toContain('Cómo montar un blog');
    expect(res.items[0]).toMatchObject({ type: 'enlace', data: { kind: 'articulo' }, link: 'https://blog.example.com/post' });
  });

  it('si la IA falla con un enlace desconocido, se guarda como enlace a revisar con su aviso', async () => {
    const failing: AiProvider = {
      async generateJson() {
        throw new Error('Tiempo de espera agotado');
      },
      async generateText() {
        throw new Error('x');
      },
    };
    const preview = async () => ({ title: 'Un blog', image: null, site: null });
    const { deps } = setup(failing, { preview });
    const res = await captureText({ text: 'https://blog.example.com/post', origin: 'web' }, deps);
    expect(res.aiError).toBe('timeout');
    expect(res.items[0]).toMatchObject({ type: 'enlace', title: 'Un blog', needsReview: true, link: 'https://blog.example.com/post' });
  });

  it('si la vista previa falla, el enlace se guarda igual', async () => {
    const { ai } = aiForbidden();
    const { deps } = setup(ai, { preview: async () => { throw new Error('bloqueado'); } });
    const res = await captureText({ text: 'https://www.youtube.com/watch?v=abc', origin: 'web' }, deps);
    expect(res.items[0].type).toBe('enlace');
  });
});

describe('captureText v2 · enlaces dentro de una nota', () => {
  it('la URL de una nota con una cosa se guarda como enlace de esa cosa', async () => {
    const { ai } = aiReturning([{ kind: 'tarea', title: 'Ver la oferta de Funko', confidence: 0.9 }]);
    const { db, deps } = setup(ai);
    const res = await captureText({ text: 'ver la oferta de Funko https://funko.es/oferta', origin: 'web' }, deps);
    expect(res.items[0].link).toBe('https://funko.es/oferta');
    expect((await createLinksRepo(db).listLinks(res.items[0].id)).map((l) => l.url)).toEqual(['https://funko.es/oferta']);
  });

  it('con varias cosas, los enlaces van con la primera', async () => {
    const { ai } = aiReturning([
      { kind: 'compra', title: 'Reloj', confidence: 0.9 },
      { kind: 'tarea', title: 'Llamar', confidence: 0.9 },
    ]);
    const { db, deps } = setup(ai);
    const res = await captureText({ text: 'reloj https://casio.com/x y llamar', origin: 'web' }, deps);
    expect((await createLinksRepo(db).listLinks(res.items[0].id)).length).toBe(1);
    expect(await createLinksRepo(db).listLinks(res.items[1].id)).toEqual([]);
  });
});

describe('captureText v2 · lo que no cambia', () => {
  it('Trabajo nunca llega a la IA ni toca tiendas, tags ni enlaces', async () => {
    const { ai, calls } = aiForbidden();
    const { db, deps } = setup(ai);
    const res = await captureText({ text: 'comprar monitor #oficina https://amazon.es/dp/1', area: 'trabajo', origin: 'web' }, deps);
    expect(calls).toEqual([]);
    expect(res.items[0]).toMatchObject({ type: 'tarea', area: 'trabajo' });
    expect(db.tables.stores).toHaveLength(0);
    expect(db.tables.tags).toHaveLength(0);
    expect(db.tables.item_links).toHaveLength(0);
  });

  it('si la IA falla con un texto normal, queda en Sin clasificar con el texto original', async () => {
    const failing: AiProvider = { generateJson: async () => { throw new Error('boom'); }, generateText: async () => { throw new Error('boom'); } };
    const { deps } = setup(failing);
    const res = await captureText({ text: 'algo #viajes', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ type: 'tarea', needsReview: true, title: 'algo #viajes', sourceText: 'algo #viajes' });
  });
});

describe('captureText v2 · sugerencia y registro de clasificación', () => {
  it('un item dudoso lleva la sugerencia de la IA para la Bandeja', async () => {
    const { ai } = aiReturning([{ kind: 'idea', title: 'Trabajar', confidence: 0.2 }]);
    const { deps } = setup(ai);
    const res = await captureText({ text: 'Trabajar', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ needsReview: true, suggestion: { type: 'idea', confidence: 0.2 } });
  });

  it('un item seguro no lleva sugerencia, y un tipo fijado con atajo tampoco', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.95 }]);
    const { deps } = setup(ai);
    expect((await captureText({ text: 'comprar leche', origin: 'web' }, deps)).items[0].suggestion).toBeNull();
    const low = aiReturning([{ kind: 'idea', title: 'pilas', confidence: 0.3 }]);
    const { deps: d2 } = setup(low.ai);
    expect((await captureText({ text: '/compra pilas', origin: 'web' }, d2)).items[0].suggestion).toBeNull();
  });

  it('cada captura queda en el registro con su texto original, lo que dijo el modelo y los items', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.95 }]);
    const { db, deps } = setup(ai, {});
    const log = createCaptureLogRepo(db);
    const res = await captureText({ text: 'comprar leche #casa', origin: 'siri' }, { ...deps, log });
    const [entry] = await log.list();
    expect(res.logId).toBe(entry.id);
    expect(entry).toMatchObject({ rawInput: 'comprar leche #casa', source: 'siri', itemIds: res.items.map((i) => i.id), error: null });
    expect(entry.modelOutput).toEqual([expect.objectContaining({ kind: 'compra', title: 'Leche' })]);
  });

  it('si la IA falla, el registro guarda el motivo y el item de Sin clasificar', async () => {
    const failing: AiProvider = { generateJson: async () => { throw new Error('Tiempo de espera agotado'); }, generateText: async () => { throw new Error('x'); } };
    const { db, deps } = setup(failing);
    const log = createCaptureLogRepo(db);
    const res = await captureText({ text: 'algo raro', origin: 'web' }, { ...deps, log });
    expect((await log.list())[0]).toMatchObject({ rawInput: 'algo raro', error: 'timeout', modelOutput: null, itemIds: [res.items[0].id] });
  });

  it('lo de Trabajo no se registra', async () => {
    const { ai } = aiForbidden();
    const { db, deps } = setup(ai);
    const log = createCaptureLogRepo(db);
    await captureText({ text: 'informe del jueves', area: 'trabajo', origin: 'web' }, { ...deps, log });
    expect(await log.list()).toEqual([]);
  });

  it('si el registro falla, la captura sigue', async () => {
    const { ai } = aiReturning([{ kind: 'compra', title: 'Leche', confidence: 0.95 }]);
    const { deps } = setup(ai);
    const log = { record: async () => { throw new Error('db'); }, addCorrection: async () => {}, list: async () => [] };
    const res = await captureText({ text: 'comprar leche', origin: 'web' }, { ...deps, log });
    expect(res.items).toHaveLength(1);
    expect(res.logId).toBeUndefined();
  });
});
