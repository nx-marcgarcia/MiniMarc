import { beforeEach, describe, expect, it } from 'vitest';
import type { DbBackend } from '@/lib/db/backend';
import { createMemoryBackend } from '@/lib/db/memory';
import { createProjectsRepo, type ProjectsRepo } from '@/lib/db/projects';

let projects: ProjectsRepo;

beforeEach(() => {
  projects = createProjectsRepo(createMemoryBackend());
});

describe('proyectos', () => {
  it('crea un proyecto activo, sin área, y lo lista', async () => {
    const p = await projects.createProject({ name: '  Viaje a  Japón ' });
    expect(p).toMatchObject({ name: 'Viaje a Japón', status: 'activo', area: null, notes: null, dueDate: null });
    expect((await projects.listProjects()).map((x) => x.id)).toEqual([p.id]);
    expect(await projects.getProject(p.id)).toMatchObject({ name: 'Viaje a Japón' });
  });

  it('lista los activos primero, luego en pausa y terminados, cada grupo por nombre', async () => {
    const z = await projects.createProject({ name: 'Zapatero' });
    await projects.createProject({ name: 'Baño' });
    const a = await projects.createProject({ name: 'Armario' });
    await projects.updateProject(a.id, { status: 'terminado' });
    await projects.updateProject(z.id, { status: 'en_pausa' });
    expect((await projects.listProjects()).map((x) => x.name)).toEqual(['Baño', 'Zapatero', 'Armario']);
  });

  it('un nombre vacío o un estado desconocido lanzan', async () => {
    await expect(projects.createProject({ name: '   ' })).rejects.toThrow();
    const p = await projects.createProject({ name: 'Huerto' });
    await expect(projects.updateProject(p.id, { status: 'xx' as never })).rejects.toThrow();
  });

  it('findByName: exacto sin acentos ni mayúsculas, o el único prefijo', async () => {
    const j27 = await projects.createProject({ name: 'Japón 2027' });
    await projects.createProject({ name: 'Viaje a Japón' });
    expect((await projects.findByName('japon'))?.id).toBe(j27.id);
    expect((await projects.findByName('VIAJE A JAPON'))?.name).toBe('Viaje a Japón');
  });

  it('findByName no adivina entre dos prefijos iguales', async () => {
    const j27 = await projects.createProject({ name: 'Japón 2027' });
    await projects.createProject({ name: 'Japón 2028' });
    expect(await projects.findByName('japon')).toBeNull();
    expect((await projects.findByName('japón 2027'))?.id).toBe(j27.id);
  });

  it('findByName no usa un prefijo de un proyecto terminado', async () => {
    const p = await projects.createProject({ name: 'Mudanza piso' });
    await projects.updateProject(p.id, { status: 'terminado' });
    expect(await projects.findByName('mudanza')).toBeNull();
    expect((await projects.findByName('mudanza piso'))?.id).toBe(p.id);
  });

  it('getProject con un id que no es un uuid no consulta y devuelve null', async () => {
    const backend = { select: async () => { throw new Error('invalid input syntax for type uuid'); } } as unknown as DbBackend;
    expect(await createProjectsRepo(backend).getProject('abc')).toBeNull();
  });

  it('available es false si la tabla aún no existe, y la lista sale vacía', async () => {
    const missing = new Error('Could not find the table public.projects in the schema cache');
    const backend = { select: async () => { throw missing; } } as unknown as DbBackend;
    const repo = createProjectsRepo(backend);
    expect(await repo.available()).toBe(false);
    expect(await repo.listProjects()).toEqual([]);
    expect(await projects.available()).toBe(true);
  });
});
