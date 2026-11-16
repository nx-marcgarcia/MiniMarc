import { beforeEach, describe, expect, it } from 'vitest';
import { createCaptureLogRepo, type CaptureLogRepo } from '@/lib/db/captureLog';
import { createMemoryBackend } from '@/lib/db/memory';

let log: CaptureLogRepo;
let backend: ReturnType<typeof createMemoryBackend>;

beforeEach(() => {
  backend = createMemoryBackend();
  log = createCaptureLogRepo(backend);
});

describe('registro de clasificación', () => {
  it('guarda el texto original, la salida del modelo y los items creados', async () => {
    const id = await log.record({
      rawInput: 'Aliexpress: masaje, cajón',
      source: 'web',
      modelOutput: [{ kind: 'compra', title: 'Masaje' }],
      itemIds: ['a', 'b'],
    });
    const [row] = await log.list();
    expect(row).toMatchObject({ id, rawInput: 'Aliexpress: masaje, cajón', source: 'web', itemIds: ['a', 'b'], error: null, corrections: [] });
    expect(row.modelOutput).toEqual([{ kind: 'compra', title: 'Masaje' }]);
  });

  it('guarda el error cuando la IA falla', async () => {
    await log.record({ rawInput: 'algo', source: 'siri', modelOutput: null, error: 'timeout', itemIds: ['x'] });
    expect((await log.list())[0]).toMatchObject({ error: 'timeout', modelOutput: null });
  });

  it('las correcciones se van sumando a su captura, con la fecha', async () => {
    const id = (await log.record({ rawInput: 'x', source: 'web', modelOutput: [], itemIds: ['a'] }))!;
    await log.addCorrection(id, { itemId: 'a', field: 'type', from: 'idea', to: 'compra' }, new Date('2026-11-16T10:00:00Z'));
    await log.addCorrection(id, { itemId: 'a', field: 'personId', from: null, to: 'p1' }, new Date('2026-11-16T10:01:00Z'));
    expect((await log.list())[0].corrections).toEqual([
      { itemId: 'a', field: 'type', from: 'idea', to: 'compra', at: '2026-11-16T10:00:00.000Z' },
      { itemId: 'a', field: 'personId', from: null, to: 'p1', at: '2026-11-16T10:01:00.000Z' },
    ]);
  });

  it('una corrección sobre una captura que no existe lanza', async () => {
    await expect(log.addCorrection('nope', { itemId: 'a', field: 'type', from: 'a', to: 'b' })).rejects.toThrow();
  });

  it('record nunca lanza: si la base de datos falla devuelve null (la captura no depende del registro)', async () => {
    const broken = createCaptureLogRepo({ ...backend, insert: async () => { throw new Error('db'); } });
    expect(await broken.record({ rawInput: 'x', source: 'web', modelOutput: null, itemIds: [] })).toBeNull();
  });

  it('list va de la más reciente a la más antigua', async () => {
    await log.record({ rawInput: 'primera', source: 'web', modelOutput: null, itemIds: [] });
    await new Promise((r) => setTimeout(r, 5));
    await log.record({ rawInput: 'segunda', source: 'web', modelOutput: null, itemIds: [] });
    expect((await log.list()).map((r) => r.rawInput)).toEqual(['segunda', 'primera']);
  });
});
