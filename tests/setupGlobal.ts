import { beforeEach, vi } from 'vitest';
import { projectsActions, resetProjectsActions } from './projectsDoubles';

vi.mock('@/app/actions/projects', () => projectsActions);
// The item sheet loads the stores of a purchase itself (useStoreOptions), so any screen with a sheet imports this.
vi.mock('@/app/actions/captureFollowUp', () => import('./screens/setup').then((m) => m.followUpActionsModule));

beforeEach(() => resetProjectsActions());
