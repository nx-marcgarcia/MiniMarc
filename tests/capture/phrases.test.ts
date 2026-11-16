/** Las frases reales de tests/fixtures/phrases.ts, de punta a punta por el pipeline de captura. */
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway, TimedEventInput } from '@/lib/calendar/client';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { createItemsRepo } from '@/lib/db/items';
import { createLinksRepo } from '@/lib/db/links';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createStoresRepo } from '@/lib/db/stores';
import { createTagsRepo } from '@/lib/db/tags';
import { PHRASES, PHRASES_NOW, type Phrase } from '../fixtures/phrases';

async function world(phrase: Phrase) {
  const db = createMemoryBackend({ now: () => PHRASES_NOW });
  const people = createPeopleRepo(db);
  const stores = createStoresRepo(db);
  const tags = createTagsRepo(db);
  const rosendo = await people.upsertPersonByName('Rosendo');
  await people.updatePerson(rosendo.id, { birthday: '1960-01-14', alias: ['papá'] });
  const aina = await people.upsertPersonByName('Aina');
  await people.updatePerson(aina.id, { birthday: '1990-04-12' });
  await people.upsertPersonByName('mamá');
  await people.upsertPersonByName('Ainhoa');
  await stores.upsertStoreByName('Casio', { domain: 'casio.com' });
  await tags.upsertTagByName('casa');
  await tags.upsertTagByName('viajes');

  const aiCalls: string[] = [];
  const ai: AiProvider = {
    async generateJson<T>(prompt: string, schema: ZodType<T>) {
      aiCalls.push(prompt);
      if (phrase.model === null) throw new Error('esta frase no debe llegar a la IA');
      return schema.parse({ items: phrase.model });
    },
    async generateText() {
      throw new Error('not used');
    },
  };

  const events: TimedEventInput[] = [];
  const gw: CalendarGateway = {
    async createEvent(_id, e) {
      if (!e.allDay) events.push(e);
      return `ev-${events.length}`;
    },
    async updateEvent() {},
    async setRequiredReminders() {},
    async deleteEvent() {},
    async listEvents() {
      return [];
    },
    async ensureCalendar() {
      return 'tareas';
    },
  };
  const deps: CaptureDeps = {
    ai,
    items: createItemsRepo(db, { now: () => PHRASES_NOW }),
    people,
    stores,
    links: createLinksRepo(db),
    tags,
    preview: async () => phrase.page ?? null,
    calendar: async () => gw,
    now: PHRASES_NOW,
    tz: 'Europe/Madrid',
  };
  return { db, deps, aiCalls, events, rosendo };
}

describe('frases reales', () => {
  it('hay al menos 30', () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PHRASES.map((p) => p.text)).size).toBe(PHRASES.length);
  });

  it.each(PHRASES.map((p) => [p.name, p] as const))('%s', async (_name, phrase) => {
    const { deps, aiCalls } = await world(phrase);
    const res = await captureText({ text: phrase.text, origin: 'web', ...(phrase.area && { area: phrase.area }) }, deps);

    expect(res.items).toHaveLength(phrase.expect.items.length);
    phrase.expect.items.forEach((want, i) => expect(res.items[i]).toMatchObject(want));
    expect(res.eventIds).toHaveLength(phrase.expect.events ?? 0);
    expect(res.dates?.length ?? 0).toBe(phrase.expect.dates ?? 0);
    // Los enlaces sueltos de dominio conocido y lo de Trabajo no llaman a la IA.
    if (phrase.model === null) expect(aiCalls).toEqual([]);
    // Nunca se pierde el texto original.
    for (const item of res.items) expect(item.sourceText).toBe(phrase.text);
  });
});

describe('criterios de aceptación de la fase 2', () => {
  const phrase = (text: string) => PHRASES.find((p) => p.text === text)!;

  it('Aliexpress: 2 compras bajo UNA tienda Aliexpress', async () => {
    const p = phrase('Aliexpress: masaje de cabeza, cajón organizador de calcetines');
    const { deps, db } = await world(p);
    const res = await captureText({ text: p.text, origin: 'web' }, deps);
    const stores = (await createStoresRepo(db).listStores()).filter((s) => s.name === 'Aliexpress');
    expect(stores).toHaveLength(1);
    expect(res.items.map((i) => i.storeId)).toEqual([stores[0].id, stores[0].id]);
  });

  it('regalo para Rosendo: en la ficha de Rosendo (no una persona nueva), con 30 € y su cumpleaños', async () => {
    const p = phrase('regalo para Rosendo: caja para relojes, unos 30€');
    const { deps, rosendo, db } = await world(p);
    const res = await captureText({ text: p.text, origin: 'web' }, deps);
    expect(res.items[0].personId).toBe(rosendo.id);
    expect(res.items[0].data).toMatchObject({ approxPrice: 30, occasion: 'Cumpleaños' });
    expect((await createPeopleRepo(db).listPeople()).filter((x) => x.name === 'Rosendo')).toHaveLength(1);
  });

  it('YouTube: Enlace de tipo vídeo con título y miniatura guardada', async () => {
    const p = phrase('https://www.youtube.com/watch?v=abc123');
    const { deps, db } = await world(p);
    const res = await captureText({ text: p.text, origin: 'web' }, deps);
    const [link] = await createLinksRepo(db).listLinks(res.items[0].id);
    expect(link).toMatchObject({ title: 'Receta de tortilla', image: 'https://i.ytimg.com/vi/abc123/hq.jpg' });
  });

  it('un enlace de tienda: Compra con la tienda, el título y la imagen', async () => {
    const p = phrase('https://www.casio.com/es/watches/MTP-B220BL-1AV/');
    const { deps, db } = await world(p);
    const res = await captureText({ text: p.text, origin: 'web' }, deps);
    const store = (await createStoresRepo(db).listStores()).find((s) => s.name === 'Casio')!;
    expect(res.items[0].storeId).toBe(store.id);
    expect((await createLinksRepo(db).listLinks(res.items[0].id))[0].image).toBe('https://www.casio.com/i.png');
  });

  it('"llamar al de la tienda funko el jueves a las 10": fecha y hora correctas en Madrid (CET, UTC+1)', async () => {
    const p = phrase('llamar al de la tienda funko el jueves a las 10');
    const { deps, events } = await world(p);
    const res = await captureText({ text: p.text, origin: 'web' }, deps);
    expect(res.items[0].dueAt).toBe('2026-11-19T09:00:00.000Z');
    expect(events).toHaveLength(1);
  });

  it('"Trabajar": a la Bandeja con sugerencia, no a Ideas', async () => {
    const p = phrase('Trabajar');
    const { deps } = await world(p);
    const [item] = (await captureText({ text: p.text, origin: 'web' }, deps)).items;
    expect(item.needsReview).toBe(true);
    expect(item.suggestion).not.toBeNull();
    expect(await deps.items.listItems({ type: 'idea', open: true, needsReview: false })).toEqual([]);
  });

  it('ninguna captura se pierde aunque la IA falle', async () => {
    const p = phrase('comprar leche y llamar a mamá');
    const { deps } = await world(p);
    const failing: AiProvider = { generateJson: async () => { throw new Error('caída'); }, generateText: async () => { throw new Error('caída'); } };
    const res = await captureText({ text: p.text, origin: 'web' }, { ...deps, ai: failing });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ title: p.text, needsReview: true, sourceText: p.text });
  });
});
