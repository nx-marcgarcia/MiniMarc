import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type { AiProvider } from '@/lib/ai/provider';
import type { CalendarGateway } from '@/lib/calendar/client';
import { captureText, type CaptureDeps } from '@/lib/capture/pipeline';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createProjectsRepo, type ProjectsRepo } from '@/lib/db/projects';

const NOW = new Date('2026-11-16T09:00:00.000Z');

function aiReturning(items: Record<string, unknown>[]) {
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

const calendar = async (): Promise<CalendarGateway> => {
  throw new Error('no calendar');
};

function setup(ai: AiProvider, over: Partial<CaptureDeps> = {}) {
  const db = createMemoryBackend({ now: () => NOW });
  const projects = createProjectsRepo(db);
  const deps: CaptureDeps = {
    ai,
    items: createItemsRepo(db, { now: () => NOW }),
    people: createPeopleRepo(db),
    projects,
    calendar,
    now: NOW,
    tz: 'Europe/Madrid',
    ...over,
  };
  return { deps, projects };
}

describe('captura con >proyecto', () => {
  it('>japon comprar adaptador → el item va al proyecto y el título no lleva el atajo', async () => {
    const { ai, prompts } = aiReturning([{ kind: 'compra', title: 'Adaptador de enchufe', confidence: 0.9 }]);
    const { deps, projects } = setup(ai);
    const japon = await projects.createProject({ name: 'Japón 2027' });
    const res = await captureText({ text: '>japon comprar adaptador', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ type: 'compra', projectId: japon.id });
    expect(prompts[0]).not.toContain('>japon');
  });

  it('>reforma sin proyectos crea «reforma» y el item va dentro', async () => {
    const { ai } = aiReturning([{ kind: 'tarea', title: 'Llamar al fontanero', confidence: 0.9 }]);
    const { deps, projects } = setup(ai);
    const res = await captureText({ text: '>reforma llamar al fontanero', origin: 'web' }, deps);
    const [p] = await projects.listProjects();
    expect(p).toMatchObject({ name: 'reforma', status: 'activo' });
    expect(res.items[0].projectId).toBe(p.id);
  });

  it('un proyecto de Trabajo: el texto no pasa por la IA y el item es de Trabajo', async () => {
    const { ai, prompts } = aiReturning([]);
    const { deps, projects } = setup(ai);
    const cx = await projects.createProject({ name: 'cliente x', area: 'trabajo' });
    const res = await captureText({ text: '>cliente_x revisar contrato', origin: 'web' }, deps);
    expect(prompts).toEqual([]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ type: 'tarea', area: 'trabajo', projectId: cx.id, title: 'revisar contrato' });
  });

  it('sin la migración 0014 la captura sale igual, sin proyecto', async () => {
    const { ai } = aiReturning([{ kind: 'tarea', title: 'Cajas', confidence: 0.9 }]);
    const unavailable: ProjectsRepo = {
      listProjects: async () => [],
      getProject: async () => null,
      createProject: async () => {
        throw new Error('Could not find the table public.projects');
      },
      updateProject: async () => {
        throw new Error('no');
      },
      findByName: async () => null,
      available: async () => false,
    };
    const { deps } = setup(ai, { projects: unavailable });
    const res = await captureText({ text: '>mudanza cajas', origin: 'web' }, deps);
    expect(res.items[0]).toMatchObject({ title: 'Cajas', projectId: null });
  });

  it('el projectId del formulario (captura en la ficha) gana sobre >', async () => {
    const { ai } = aiReturning([{ kind: 'tarea', title: 'Billetes', confidence: 0.9 }]);
    const { deps, projects } = setup(ai);
    const japon = await projects.createProject({ name: 'Japón' });
    await projects.createProject({ name: 'Mudanza' });
    const res = await captureText({ text: '>mudanza billetes', origin: 'web', projectId: japon.id }, deps);
    expect(res.items[0].projectId).toBe(japon.id);
  });

  it('una captura de Trabajo hecha en la ficha también va al proyecto', async () => {
    const { ai, prompts } = aiReturning([]);
    const { deps, projects } = setup(ai);
    const p = await projects.createProject({ name: 'Cliente Y' });
    const res = await captureText({ text: 'enviar propuesta', origin: 'web', area: 'trabajo', projectId: p.id }, deps);
    expect(prompts).toEqual([]);
    expect(res.items[0]).toMatchObject({ area: 'trabajo', projectId: p.id });
  });
});

describe('captura en la ficha cuando el proyecto no se puede leer', () => {
  it('no se arriesga: no pasa por la IA y queda en la Bandeja', async () => {
    const { ai, prompts } = aiReturning([{ kind: 'tarea', title: 'X', confidence: 0.9 }]);
    const { deps, projects } = setup(ai);
    const broken: ProjectsRepo = { ...projects, getProject: async () => { throw new Error('timeout'); } };
    const res = await captureText({ text: 'propuesta cliente', origin: 'web', projectId: '00000000-0000-0000-0000-000000000001' }, { ...deps, projects: broken });
    expect(prompts).toEqual([]);
    expect(res.items[0]).toMatchObject({ needsReview: true, title: 'propuesta cliente' });
  });
});

describe('captura con tipo elegido, en la ficha de un proyecto', () => {
  it('una tarea con el chip Tarea va al proyecto', async () => {
    const { saveTypedItem } = await import('@/lib/capture/typed');
    const { ai } = aiReturning([]);
    const { deps, projects } = setup(ai);
    const p = await projects.createProject({ name: 'Mudanza' });
    const item = await saveTypedItem('tarea', 'Pedir cajas', { projectId: p.id }, deps, 'web');
    expect(item.projectId).toBe(p.id);
  });

  it('un proyecto que ya no existe no impide guardar', async () => {
    const { saveTypedItem } = await import('@/lib/capture/typed');
    const { ai } = aiReturning([]);
    const { deps } = setup(ai);
    const item = await saveTypedItem('idea', 'Algo', { projectId: 'no-existe' }, deps, 'web');
    expect(item.projectId).toBeNull();
  });
});
