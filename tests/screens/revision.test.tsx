// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { RevisionScreen } from '@/components/revision/RevisionScreen';
import { REVIEW_KEY, type Review } from '@/lib/revision';
import { makeProject, projectsActions } from '../projectsDoubles';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

beforeEach(() => localStorage.clear());

const review = (over: Partial<Review> = {}): Review => ({
  inbox: 2,
  projects: [{ project: makeProject({ id: 'p1', name: 'Viaje a Japón' }), nextTask: null }],
  overdue: [makeItem({ id: 't1', title: 'Pagar seguro', dueAt: '2026-11-10T10:00:00.000Z', hasTime: true })],
  rescue: [makeItem({ id: 'e1', type: 'enlace', status: 'por_ver', title: 'Artículo viejo' })],
  tidy: { looseIdeas: [], noStore: 0 },
  nextWeekStart: '2026-11-23',
  ...over,
});

const ui = (r = review()) => <RevisionScreen review={r} today="2026-11-16" tz="Europe/Madrid" />;

test('cinco pasos, con la Bandeja y la semana que viene enlazadas', () => {
  renderScreen(ui());
  expect(screen.getByRole('link', { name: /Procesar/ }).getAttribute('href')).toBe('/sin-clasificar');
  expect(screen.getByRole('link', { name: /Ver la semana que viene/ }).getAttribute('href')).toBe('/semana?w=2026-11-23');
  expect(screen.getByText('Sin siguiente paso')).toBeTruthy();
});

test('Hecho en una atrasada llama a toggleDone y la quita', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Hecho: Pagar seguro' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledWith('t1'));
  await waitFor(() => expect(screen.queryByText('Pagar seguro')).toBeNull());
});

test('Mañana mueve la fecha al día siguiente a la misma hora', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Mañana: Pagar seguro' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0]).toEqual(['t1', { dueAt: '2026-11-17T10:00:00.000Z', hasTime: true }]);
});

test('una tarea atrasada por su fecha límite lo dice, y Mañana no toca la fecha límite', async () => {
  const t = makeItem({ id: 'd1', title: 'Entregar informe', dueAt: '2026-11-20T10:00:00.000Z', hasTime: false, data: { deadline: '2026-11-14' } });
  const { user } = renderScreen(ui(review({ overdue: [t] })));
  expect(screen.getByText(/Límite: 14 de noviembre/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Mañana: Entregar informe' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(Object.keys(itemsActions.moveItem.mock.calls[0][1]).sort()).toEqual(['dueAt', 'hasTime']);
});

test('Archivar algo olvidado lo archiva', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Archivar: Artículo viejo' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('e1', { archived: true }));
});

test('Pausar un proyecto', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Pausar: Viaje a Japón' }));
  await waitFor(() => expect(projectsActions.setProjectStatus).toHaveBeenCalledWith('p1', 'en_pausa'));
});

test('Terminar revisión la apunta en este dispositivo', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Terminar revisión' }));
  expect(localStorage.getItem(REVIEW_KEY)).toBeTruthy();
});

test('Hoy recuerda la revisión un lunes sin revisión reciente, y no si ya se hizo', async () => {
  const { ReviewReminder } = await import('@/components/revision/ReviewReminder');
  const monday = new Date('2026-11-16T09:00:00Z');
  const { unmount } = renderScreen(<ReviewReminder tz="Europe/Madrid" now={monday} />);
  expect((await screen.findByRole('link', { name: /Toca revisión semanal/ })).getAttribute('href')).toBe('/revision');
  unmount();
  localStorage.setItem(REVIEW_KEY, '2026-11-15T20:00:00Z');
  renderScreen(<ReviewReminder tz="Europe/Madrid" now={monday} />);
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByRole('link', { name: /Toca revisión semanal/ })).toBeNull();
});

test('ordenar lo antiguo: una idea suelta se pasa a tarea o se deja, y las compras sin tienda llevan a Compras', async () => {
  const trabajar = makeItem({ id: 'i1', type: 'idea', status: 'semilla', title: 'Trabajar', area: null });
  const { user } = renderScreen(ui(review({ tidy: { looseIdeas: [trabajar], noStore: 3 } })));
  expect(screen.getByText('3 compras sin tienda')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Abrir Compras' }).getAttribute('href')).toBe('/compras');
  await user.click(screen.getByRole('button', { name: 'Es una tarea: Trabajar' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('i1', { type: 'tarea' }));
  await waitFor(() => expect(screen.queryByText('Trabajar')).toBeNull());
});

test('«Es una idea» solo la quita de la lista, sin guardar nada', async () => {
  const trabajar = makeItem({ id: 'i1', type: 'idea', status: 'semilla', title: 'Trabajar', area: null });
  const { user } = renderScreen(ui(review({ tidy: { looseIdeas: [trabajar], noStore: 0 } })));
  await user.click(screen.getByRole('button', { name: 'Es una idea: Trabajar' }));
  await waitFor(() => expect(screen.queryByText('Trabajar')).toBeNull());
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
});

test('sin nada por ordenar, el bloque no aparece', () => {
  renderScreen(ui());
  expect(screen.queryByText('Ordenar lo antiguo')).toBeNull();
});
