import { describe, expect, it } from 'vitest';
import { UserError } from '@/lib/actions/result';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createResurfacingRepo } from '@/lib/db/resurfacing';
import type { Candidate } from '@/lib/resurfacing/candidates';
import { actOnCandidate, actOnEvent, type ActDeps } from '@/lib/resurfacing/actions';
import { madridToUtc } from '@/lib/time';

const NOW = madridToUtc('2026-11-17', '11:00'); // martes

function setup() {
  const backend = createMemoryBackend({ now: () => NOW });
  const deps: ActDeps = {
    items: createItemsRepo(backend, { now: () => NOW }),
    people: createPeopleRepo(backend),
    resurfacing: createResurfacingRepo(backend, { now: () => NOW }),
    now: () => NOW,
    tz: 'Europe/Madrid',
  };
  return deps;
}
const sent = (deps: ActDeps, itemId: string | null, subject = `item:${itemId}`) => deps.resurfacing.record({ itemId, subject, kind: 'atrasada', channel: 'telegram' });

describe('Hecho', () => {
  it('cierra la tarea y apunta la acción', async () => {
    const deps = setup();
    const t = await deps.items.createItem({ type: 'tarea', title: 'Llamar', area: 'personal' });
    const e = await sent(deps, t.id);
    const out = await actOnEvent(deps, e.id, 'hecho');
    expect(out.message).toBe('Hecha ✓');
    expect((await deps.items.listItems()).find((i) => i.id === t.id)?.status).toBe('hecha');
    expect(out.event).toMatchObject({ action: 'hecho', actedAt: NOW.toISOString() });
  });

  it('una idea pasa a «en marcha» y una compra a «comprado» (lo que cierra cada tipo)', async () => {
    const deps = setup();
    const idea = await deps.items.createItem({ type: 'idea', title: 'App' });
    const compra = await deps.items.createItem({ type: 'compra', title: 'Pilas' });
    expect((await actOnEvent(deps, (await sent(deps, idea.id)).id, 'hecho')).message).toBe('En marcha ✓');
    expect((await actOnEvent(deps, (await sent(deps, compra.id)).id, 'hecho')).message).toBe('Comprado ✓');
  });

  it('una tarea que se repite pasa a su siguiente fecha en vez de cerrarse', async () => {
    const deps = setup();
    const t = await deps.items.createItem({ type: 'tarea', title: 'Regar', area: 'personal', dueAt: madridToUtc('2026-11-16', '09:00').toISOString(), hasTime: true, data: { recurrence: 'semanal' } });
    const out = await actOnEvent(deps, (await sent(deps, t.id)).id, 'hecho');
    expect(out.message).toBe('Hecha. Pasa a su próxima fecha');
    const after = (await deps.items.listItems()).find((i) => i.id === t.id)!;
    expect(after.status).toBe('pendiente');
    expect(after.dueAt).toBe(madridToUtc('2026-11-23', '09:00').toISOString());
  });

  it('un item que ya estaba cerrado no se reabre', async () => {
    const deps = setup();
    const t = await deps.items.createItem({ type: 'tarea', title: 'Llamar', area: 'personal', status: 'hecha' });
    const out = await actOnEvent(deps, (await sent(deps, t.id)).id, 'hecho');
    expect(out.message).toBe('Ya estaba cerrado');
    expect((await deps.items.listItems()).find((i) => i.id === t.id)?.status).toBe('hecha');
  });
});

describe('Posponer 1 semana', () => {
  it('una tarea con fecha pasa a dentro de 7 días, a la misma hora, y cuenta la pospuesta', async () => {
    const deps = setup();
    const t = await deps.items.createItem({ type: 'tarea', title: 'Llamar', area: 'personal', dueAt: madridToUtc('2026-11-10', '09:30').toISOString(), hasTime: true });
    const out = await actOnEvent(deps, (await sent(deps, t.id)).id, 'posponer');
    expect(out.message).toBe('Pospuesto una semana');
    const after = (await deps.items.listItems()).find((i) => i.id === t.id)!;
    expect(after.dueAt).toBe(madridToUtc('2026-11-24', '09:30').toISOString());
    expect(after.snoozeCount).toBe(1);
  });

  it('lo demás se esconde del resurfacing hasta dentro de 7 días', async () => {
    const deps = setup();
    const idea = await deps.items.createItem({ type: 'idea', title: 'App' });
    await actOnEvent(deps, (await sent(deps, idea.id)).id, 'posponer');
    const after = (await deps.items.listItems()).find((i) => i.id === idea.id)!;
    expect(after.snoozedUntil).toBe(new Date(NOW.getTime() + 7 * 86_400_000).toISOString());
    expect(after.snoozeCount).toBe(1);
  });

  it('la cuenta sigue subiendo: a la tercera, el candidato pregunta si se archiva', async () => {
    const deps = setup();
    const idea = await deps.items.createItem({ type: 'idea', title: 'App' });
    for (let i = 0; i < 3; i++) await actOnEvent(deps, (await sent(deps, idea.id)).id, 'posponer');
    expect((await deps.items.listItems()).find((x) => x.id === idea.id)?.snoozeCount).toBe(3);
  });

  it('el cumpleaños de una persona (sin item) solo apunta que se pospuso', async () => {
    const deps = setup();
    const out = await actOnEvent(deps, (await sent(deps, null, 'date:p1:2026-11-20')).id, 'posponer');
    expect(out.message).toBe('Te lo recuerdo más adelante');
    expect(out.event.action).toBe('posponer');
  });
});

describe('Archivar', () => {
  it('archiva y apunta', async () => {
    const deps = setup();
    const idea = await deps.items.createItem({ type: 'idea', title: 'App' });
    const out = await actOnEvent(deps, (await sent(deps, idea.id)).id, 'archivar');
    expect(out.message).toBe('Archivado');
    expect((await deps.items.listItems()).find((i) => i.id === idea.id)?.archived).toBe(true);
  });

  it('una fecha de persona no se archiva', async () => {
    const deps = setup();
    await expect(actOnEvent(deps, (await sent(deps, null, 'date:p1:2026-11-20')).id, 'archivar')).rejects.toThrow(UserError);
  });
});

describe('casos raros', () => {
  it('pulsar dos veces (o Telegram reintentando) no lo hace dos veces', async () => {
    const deps = setup();
    const idea = await deps.items.createItem({ type: 'idea', title: 'App' });
    const e = await sent(deps, idea.id);
    await actOnEvent(deps, e.id, 'posponer');
    const again = await actOnEvent(deps, e.id, 'posponer');
    expect(again.message).toBe('Ya lo habías hecho');
    expect((await deps.items.listItems()).find((i) => i.id === idea.id)?.snoozeCount).toBe(1);
  });

  it('un aviso que no existe, o un item que ya no existe, dan un mensaje claro', async () => {
    const deps = setup();
    await expect(actOnEvent(deps, 'nope', 'hecho')).rejects.toThrow(/ya no existe/);
    const e = await sent(deps, 'borrado');
    await expect(actOnEvent(deps, e.id, 'hecho')).rejects.toThrow(/ya no existe/);
  });

  it('desde la web («Para hoy») apunta el aviso con canal web y actúa igual', async () => {
    const deps = setup();
    const idea = await deps.items.createItem({ type: 'idea', title: 'App' });
    const c: Candidate = { subject: `item:${idea.id}`, itemId: idea.id, kind: 'idea_olvidada', urgent: false, rank: 6, title: 'App', href: '/ideas', detail: '', askArchive: false };
    const out = await actOnCandidate(deps, c, 'archivar');
    expect(out.event).toMatchObject({ channel: 'web', kind: 'idea_olvidada', subject: `item:${idea.id}`, action: 'archivar' });
    expect((await deps.items.listItems()).find((i) => i.id === idea.id)?.archived).toBe(true);
  });
});
