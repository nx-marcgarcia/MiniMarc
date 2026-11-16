'use server';

import { unstable_rethrow } from 'next/navigation';
import { createProjectActions } from '@/lib/actions/projects';
import { attempt } from '@/lib/actions/result';
import type { ActionResult } from '@/lib/actions/result';
import { runAction, sessionDeps } from '@/lib/actions/server';
import type { Project, ProjectStatus } from '@/lib/db/projects';

/* Thin wrappers over lib/actions/projects.ts: authenticate, delegate, invalidate the item lists. */
const actions = createProjectActions(runAction);

export async function createProject(fd: FormData): Promise<ActionResult<Project>> {
  return actions.createProject(fd);
}

export async function updateProject(id: string, fd: FormData): Promise<ActionResult<Project>> {
  return actions.updateProject(id, fd);
}

export async function setProjectStatus(id: string, status: ProjectStatus): Promise<ActionResult<Project>> {
  return actions.setProjectStatus(id, status);
}

export async function ideaToProject(ideaId: string): Promise<ActionResult<Project>> {
  return actions.ideaToProject(ideaId);
}

/** The item sheet's "Proyecto" list (read only). `available` false before 0014: no selector, no "Convertir". */
export async function listProjectOptions(): Promise<ActionResult<{ available: boolean; projects: Project[] }>> {
  return attempt(
    async () => {
      const { deps } = await sessionDeps();
      const repo = deps.projects!;
      const [available, projects] = await Promise.all([repo.available(), repo.listProjects()]);
      return { available, projects: projects.filter((p) => p.status !== 'terminado') };
    },
    'No se han podido leer los proyectos.',
    unstable_rethrow,
  );
}
