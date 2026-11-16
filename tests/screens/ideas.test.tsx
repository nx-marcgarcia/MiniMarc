// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { IdeasScreen } from '@/components/ideas/IdeasScreen';
import { fail } from '@/lib/actions/result';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const idea = (id: string, title: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'idea', title, status: 'semilla', area: null, data: {}, tags: [], ...over });

const ideas = [
  idea('a', 'App de recetas', { data: { category: 'negocio', potential: 4, nextStep: 'Hablar con Rosendo' }, tags: ['app'] }),
  idea('b', 'Canal de vídeo', { status: 'explorando', data: { category: 'contenido' }, tags: ['video'] }),
  idea('c', 'Vender sellos', { status: 'descartada', data: { category: 'negocio' } }),
];
const ui = () => <IdeasScreen ideas={ideas} />;

test('las ideas no llevan círculo de completar y se ven con su categoría y siguiente paso', () => {
  renderScreen(ui());
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByText('App de recetas')).toBeTruthy();
  const row = screen.getByText('App de recetas').closest('.app-idea') as HTMLElement;
  expect(row.querySelector('.app-idea__category')?.textContent).toBe('negocio');
  expect(within(row).getByLabelText('Potencial: 4 de 5').textContent).toBe('★★★★☆');
  expect(within(row).getByText('→ Hablar con Rosendo')).toBeTruthy();
});

test('cada estado es una pestaña; las descartadas solo salen en la suya', async () => {
  const { user } = renderScreen(ui());
  expect(screen.getByRole('radio', { name: 'Semilla' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.queryByText('Vender sellos')).toBeNull();
  expect(screen.queryByText('Canal de vídeo')).toBeNull();
  await user.click(screen.getByRole('radio', { name: 'Descartadas' }));
  expect(screen.getByText('Vender sellos')).toBeTruthy();
  expect(screen.queryByText('App de recetas')).toBeNull();
});

test('filtra por categoría y por tag', async () => {
  const { user } = renderScreen(ui());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'contenido');
  expect(screen.queryByText('App de recetas')).toBeNull();
  await user.click(screen.getByRole('radio', { name: 'Explorando' }));
  expect(screen.getByText('Canal de vídeo')).toBeTruthy();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), '');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'app');
  expect(screen.queryByText('Canal de vídeo')).toBeNull();
  await user.click(screen.getByRole('radio', { name: 'Semilla' }));
  expect(screen.getByText('App de recetas')).toBeTruthy();
});

test('el botón de la fila avanza la idea al siguiente estado y se puede deshacer', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Explorar: «App de recetas»' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('a', { status: 'explorando' }));
  expect(screen.queryByText('App de recetas')).toBeNull();
  expect(await screen.findByText('Movida a Explorando')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Deshacer' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('a', { status: 'semilla' }));
  expect(await screen.findByText('App de recetas')).toBeTruthy();
});

test('si no se puede guardar el estado, la idea vuelve al que tenía y se avisa', async () => {
  itemsActions.moveItem.mockResolvedValue(fail('No se pudo.'));
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Explorar: «App de recetas»' }));
  expect(await screen.findByText('No se pudo.')).toBeTruthy();
  expect(screen.getByText('App de recetas')).toBeTruthy();
});

test('pulsar una idea abre su hoja de edición', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Abrir «App de recetas»' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByDisplayValue('App de recetas')).toBeTruthy();
});

test('sin ideas dice cómo se crean', () => {
  renderScreen(<IdeasScreen ideas={[]} />);
  expect(screen.getByText(/Aún no hay ideas/)).toBeTruthy();
});
