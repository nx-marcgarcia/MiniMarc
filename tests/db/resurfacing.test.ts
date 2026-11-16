import { describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createResurfacingRepo } from '@/lib/db/resurfacing';

function setup() {
  let t = new Date('2026-11-17T10:00:00.000Z');
  const clock = () => t;
  const repo = createResurfacingRepo(createMemoryBackend({ now: clock }), { now: clock });
  return { repo, advance: (days: number) => (t = new Date(t.getTime() + days * 86_400_000)) };
}

describe('resurfacing_events', () => {
  it('apunta lo enviado: qué, por qué canal y cuándo', async () => {
    const { repo } = setup();
    const e = await repo.record({ itemId: 'i1', subject: 'item:i1', kind: 'atrasada', channel: 'telegram' });
    expect(e).toMatchObject({ itemId: 'i1', subject: 'item:i1', kind: 'atrasada', channel: 'telegram', sentAt: '2026-11-17T10:00:00.000Z', action: null, actedAt: null, telegramMessageId: null });
    expect(await repo.get(e.id)).toEqual(e);
  });

  it('un aviso que no es de un item (el cumpleaños de una persona) se apunta por su subject', async () => {
    const { repo } = setup();
    const e = await repo.record({ itemId: null, subject: 'date:p1:2026-12-01', kind: 'regalo_sin_comprar', channel: 'push' });
    expect(e.itemId).toBeNull();
  });

  it('guarda qué hice (hecho, posponer, archivar, abrir) y cuándo', async () => {
    const { repo, advance } = setup();
    const e = await repo.record({ itemId: 'i1', subject: 'item:i1', kind: 'atrasada', channel: 'telegram' });
    advance(1);
    const acted = await repo.markAction(e.id, 'posponer');
    expect(acted).toMatchObject({ action: 'posponer', actedAt: '2026-11-18T10:00:00.000Z' });
  });

  it('no existe → error claro', async () => {
    const { repo } = setup();
    await expect(repo.markAction('nope', 'hecho')).rejects.toThrow(/no existe/i);
    expect(await repo.get('nope')).toBeNull();
  });

  it('apunta el mensaje de Telegram para poder editarlo después', async () => {
    const { repo } = setup();
    const e = await repo.record({ itemId: 'i1', subject: 'item:i1', kind: 'atrasada', channel: 'telegram' });
    expect((await repo.setTelegramMessage(e.id, 4242)).telegramMessageId).toBe(4242);
  });

  it('sentSince: los avisos desde una fecha, para no repetir el mismo item en 7 días', async () => {
    const { repo, advance } = setup();
    await repo.record({ itemId: 'old', subject: 'item:old', kind: 'x', channel: 'push' });
    advance(8);
    await repo.record({ itemId: 'new', subject: 'item:new', kind: 'x', channel: 'push' });
    const since = new Date('2026-11-25T10:00:00.000Z');
    since.setDate(since.getDate() - 7);
    expect((await repo.sentSince(since.toISOString())).map((e) => e.subject)).toEqual(['item:new']);
  });

  it('countActions: cuántas veces se pospuso un subject', async () => {
    const { repo } = setup();
    for (let i = 0; i < 3; i++) {
      const e = await repo.record({ itemId: 'i1', subject: 'item:i1', kind: 'x', channel: 'telegram' });
      await repo.markAction(e.id, 'posponer');
    }
    const e = await repo.record({ itemId: 'i1', subject: 'item:i1', kind: 'x', channel: 'telegram' });
    await repo.markAction(e.id, 'abrir');
    expect(await repo.countActions('item:i1', 'posponer')).toBe(3);
    expect(await repo.countActions('item:otro', 'posponer')).toBe(0);
  });
});
