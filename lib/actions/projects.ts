/** Project write actions over injected repos (app/actions/projects.ts exposes them). */
import { z } from 'zod';
import type { Project, ProjectsRepo, ProjectStatus } from '@/lib/db/projects';
import { PROJECT_STATUSES } from '@/lib/db/projects';
import { isValidDate } from '@/lib/time';
import type { ActionDeps } from './items';
import { UserError } from './result';
import type { ActionRunner } from './run';
import { WRITES } from '@/lib/cache/tags';

export const NO_PROJECTS = 'Falta aplicar la migración 0014 en Supabase (SQL Editor).';
const EMPTY_NAME = 'El nombre no puede estar vacío';

type Deps = ActionDeps & { projects?: ProjectsRepo };

function repo(deps: Deps): ProjectsRepo {
  if (!deps.projects) throw new UserError(NO_PROJECTS);
  return deps.projects;
}

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim() : '';
};

function fromForm(fd: FormData) {
  const name = field(fd, 'name').replace(/\s+/g, ' ');
  if (!name) throw new UserError(EMPTY_NAME);
  const areaRaw = field(fd, 'area');
  const area = areaRaw ? z.enum(['personal', 'trabajo']).parse(areaRaw) : null;
  const dueDate = field(fd, 'dueDate') || null;
  if (dueDate && !isValidDate(dueDate)) throw new UserError('Fecha no válida');
  return { name, area, notes: field(fd, 'notes') || null, dueDate };
}

export async function createProject(deps: Deps, fd: FormData): Promise<Project> {
  return repo(deps).createProject(fromForm(fd));
}

export async function updateProject(deps: Deps, id: string, fd: FormData): Promise<Project> {
  return repo(deps).updateProject(id, fromForm(fd));
}

/** Pausing or finishing never touches the project's items. */
export async function setProjectStatus(deps: Deps, id: string, status: ProjectStatus): Promise<Project> {
  return repo(deps).updateProject(id, { status: z.enum(PROJECT_STATUSES).parse(status) });
}

/** "Convertir en proyecto": a project from the idea's title and notes; the idea goes in it, "en marcha". */
export async function ideaToProject(deps: Deps, ideaId: string): Promise<Project> {
  const projects = repo(deps);
  const idea = (await deps.items.listItems({ type: 'idea' })).find((i) => i.id === ideaId);
  if (!idea) throw new UserError('Esa idea ya no existe');
  const project = await projects.createProject({ name: idea.title, notes: idea.notes, area: idea.area });
  await deps.items.updateItem(idea.id, { projectId: project.id, status: 'en_marcha' });
  return project;
}

const SAVE_FAILED = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** The project actions over an injected runner (lib/actions/run.ts), as createItemActions does. */
export function createProjectActions(run: ActionRunner<Deps>) {
  return {
    createProject: (fd: FormData) => run(WRITES.item, (d) => createProject(d, fd), SAVE_FAILED),
    updateProject: (id: string, fd: FormData) => run(WRITES.item, (d) => updateProject(d, id, fd), SAVE_FAILED),
    setProjectStatus: (id: string, status: ProjectStatus) => run(WRITES.item, (d) => setProjectStatus(d, id, status), SAVE_FAILED),
    ideaToProject: (ideaId: string) => run(WRITES.item, (d) => ideaToProject(d, ideaId), SAVE_FAILED),
  };
}
