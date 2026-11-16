'use server';

import { createProjectActions } from '@/lib/actions/projects';
import type { ActionResult } from '@/lib/actions/result';
import { runAction } from '@/lib/actions/server';
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
