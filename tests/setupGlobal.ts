import { beforeEach, vi } from 'vitest';
import { projectsActions, resetProjectsActions } from './projectsDoubles';

vi.mock('@/app/actions/projects', () => projectsActions);

beforeEach(() => resetProjectsActions());
