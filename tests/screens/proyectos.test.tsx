// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ProyectoScreen } from '@/components/proyectos/ProyectoScreen';
import { ProyectosScreen } from '@/components/proyectos/ProyectosScreen';
import { projectSummary } from '@/lib/projects';
import { makeProject, projectsActions } from '../projectsDoubles';
import { makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('@/app/actions/area', () => ({ setAreaFilter: vi.fn() }));
vi.mock('@/app/actions/photos', () => ({ addPhoto: vi.fn(), deletePhoto: vi.fn() }));
vi.mock('@/lib/supabase/browser', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const card = (over = {}, items = [makeItem()]) => ({ project: makeProject(over), summary: projectSummary(items) });

test('la lista dice el siguiente paso, o que falta uno', () => {
  renderScreen(
    <ProyectosScreen
      area="todo"
      available
      active={[card({ id: 'a', name: 'Viaje a Japón' }), card({ id: 'b', name: 'Huerto' }, [makeItem({ type: 'compra', status: 'quiero' })])]}
      paused={[]}
      done={[]}
    />,
  );
  const japon = screen.getByRole('link', { name: /Viaje a Japón/ });
  expect(within(japon).getByText(/Llamar al dentista/)).toBeTruthy();
  expect(japon.getAttribute('href')).toBe('/proyectos/a');
  const huerto = screen.getByRole('link', { name: /Huerto/ });
  expect(within(huerto).getByText('Sin siguiente paso')).toBeTruthy();
  expect(within(huerto).getByText('1 compra')).toBeTruthy();
});

test('sin la migración 0014 lo dice y no ofrece crear', () => {
  renderScreen(<ProyectosScreen area="todo" available={false} active={[]} paused={[]} done={[]} />);
  expect(screen.getByText(/Falta aplicar la migración 0014/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).toBeNull();
});

test('crear un proyecto manda el formulario', async () => {
  const { user } = renderScreen(<ProyectosScreen area="todo" available active={[]} paused={[]} done={[]} />);
  await user.click(screen.getByRole('button', { name: 'Nuevo proyecto' }));
  await user.type(await screen.findByLabelText('Nombre'), 'Reforma baño');
  await user.click(screen.getByRole('button', { name: 'Crear' }));
  await waitFor(() => expect(projectsActions.createProject).toHaveBeenCalledTimes(1));
  expect((projectsActions.createProject.mock.calls[0][0] as FormData).get('name')).toBe('Reforma baño');
});

test('la ficha pinta secciones solo de los tipos con items, y el estado se cambia', async () => {
  const project = makeProject({ id: 'p1' });
  const { user } = renderScreen(
    <ProyectoScreen
      project={project}
      sections={[
        { type: 'tarea', items: [makeItem({ id: 't1', title: 'Billetes', projectId: 'p1' })] },
        { type: 'enlace', items: [makeItem({ id: 'e1', type: 'enlace', status: 'por_ver', title: 'Guía de Kioto', projectId: 'p1' })] },
      ]}
      summary={projectSummary([makeItem()])}
      people={[]}
      photos={{}}
      today="2026-11-16"
    />,
  );
  expect(screen.getByText('Tareas')).toBeTruthy();
  expect(screen.getByText('Enlaces')).toBeTruthy();
  expect(screen.queryByText('Compras')).toBeNull();
  await user.click(screen.getByRole('radio', { name: 'Terminado' }));
  await waitFor(() => expect(projectsActions.setProjectStatus).toHaveBeenCalledWith('p1', 'terminado'));
});

test('una ficha sin tareas pide un siguiente paso', () => {
  renderScreen(
    <ProyectoScreen project={makeProject()} sections={[]} summary={projectSummary([])} people={[]} photos={{}} today="2026-11-16" />,
  );
  expect(screen.getByText(/Sin siguiente paso/)).toBeTruthy();
});
