/**
 * Doubles for `app/actions/projects.ts`, mocked for every test file (vitest.config.ts setupFiles):
 * the item sheet loads the project list itself, so any screen with a sheet imports it.
 * By default there are no projects and 0014 is "applied"; a test sets what it needs.
 */
import { vi } from 'vitest';
import type * as projectsModule from '@/app/actions/projects';
import { ok } from '@/lib/actions/result';
import type { Project } from '@/lib/db/projects';

export const projectsActions = {
  createProject: vi.fn<typeof projectsModule.createProject>(),
  updateProject: vi.fn<typeof projectsModule.updateProject>(),
  setProjectStatus: vi.fn<typeof projectsModule.setProjectStatus>(),
  ideaToProject: vi.fn<typeof projectsModule.ideaToProject>(),
  listProjectOptions: vi.fn<typeof projectsModule.listProjectOptions>(),
};

export function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Viaje a Japón',
    area: null,
    status: 'activo',
    notes: null,
    dueDate: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...over,
  };
}

export function resetProjectsActions() {
  for (const fn of Object.values(projectsActions)) fn.mockReset();
  projectsActions.listProjectOptions.mockResolvedValue(ok({ available: true, projects: [] }));
  for (const name of ['createProject', 'updateProject', 'setProjectStatus', 'ideaToProject'] as const) {
    projectsActions[name].mockResolvedValue(ok(makeProject()));
  }
}
