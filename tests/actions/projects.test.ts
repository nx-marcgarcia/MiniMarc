import { beforeEach, describe, expect, it } from 'vitest';
import * as items from '@/lib/actions/items';
import type { ActionDeps } from '@/lib/actions/items';
import * as projects from '@/lib/actions/projects';
import { createItemsRepo } from '@/lib/db/items';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';
import { createProjectsRepo } from '@/lib/db/projects';

let deps: ActionDeps & { projects: NonNullable<ActionDeps['projects']> };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  const backend = createMemoryBackend();
  deps = { items: createItemsRepo(backend), people: createPeopleRepo(backend), projects: createProjectsRepo(backend) };
});

describe('proyectos: acciones', () => {
  it('crea un proyecto desde el formulario (nombre, área, fecha y notas)', async () => {
    const p = await projects.createProject(deps, form({ name: 'Reforma baño', area: 'personal', dueDate: '2026-12-20', notes: 'Presupuesto' }));
    expect(p).toMatchObject({ name: 'Reforma baño', area: 'personal', dueDate: '2026-12-20', notes: 'Presupuesto', status: 'activo' });
  });

  it('sin área en el formulario, el proyecto no tiene área', async () => {
    const p = await projects.createProject(deps, form({ name: 'Huerto', area: '' }));
    expect(p.area).toBeNull();
  });

  it('rechaza un nombre vacío', async () => {
    await expect(projects.createProject(deps, form({ name: '  ' }))).rejects.toThrow(/nombre/i);
  });

  it('ideaToProject crea el proyecto con el título y las notas de la idea, y la pone en marcha', async () => {
    const idea = await deps.items.createItem({ type: 'idea', title: 'Huerto urbano', notes: 'En la terraza' });
    const p = await projects.ideaToProject(deps, idea.id);
    expect(p).toMatchObject({ name: 'Huerto urbano', notes: 'En la terraza', status: 'activo' });
    const [after] = await deps.items.listItems({ type: 'idea' });
    expect(after).toMatchObject({ projectId: p.id, status: 'en_marcha' });
  });

  it('ideaToProject solo acepta ideas', async () => {
    const t = await deps.items.createItem({ type: 'tarea', title: 'X' });
    await expect(projects.ideaToProject(deps, t.id)).rejects.toThrow();
  });

  it('terminar un proyecto deja sus tareas pendientes intactas', async () => {
    const p = await projects.createProject(deps, form({ name: 'Mudanza' }));
    const t = await deps.items.createItem({ type: 'tarea', title: 'Cajas', projectId: p.id });
    await projects.setProjectStatus(deps, p.id, 'terminado');
    expect((await deps.projects.getProject(p.id))?.status).toBe('terminado');
    const [after] = await deps.items.listItems({ type: 'tarea' });
    expect(after).toMatchObject({ id: t.id, status: 'pendiente', projectId: p.id });
  });

  it('moveItem con projectId null saca un item del proyecto', async () => {
    const p = await projects.createProject(deps, form({ name: 'Mudanza' }));
    const t = await deps.items.createItem({ type: 'tarea', title: 'Cajas', projectId: p.id });
    await items.moveItem(deps, t.id, { projectId: null });
    expect((await deps.items.listItems())[0].projectId).toBeNull();
  });

  it('addItem guarda el proyecto del formulario, y una tarea toma el área del proyecto', async () => {
    const p = await projects.createProject(deps, form({ name: 'Cliente X', area: 'trabajo' }));
    const t = await items.addItem(deps, form({ type: 'tarea', title: 'Contrato', projectId: p.id }));
    expect(t).toMatchObject({ projectId: p.id, area: 'trabajo' });
  });

  it('updateProject cambia nombre, área y notas', async () => {
    const p = await projects.createProject(deps, form({ name: 'Viaje' }));
    const u = await projects.updateProject(deps, p.id, form({ name: 'Viaje a Japón', area: 'personal', notes: '', dueDate: '' }));
    expect(u).toMatchObject({ name: 'Viaje a Japón', area: 'personal', notes: null, dueDate: null });
  });
});
