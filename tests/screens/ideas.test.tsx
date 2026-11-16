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
  expect(screen.getByText('negocio · Potencial 4/5 · Siguiente: Hablar con Rosendo')).toBeTruthy();
});

test('las descartadas no salen hasta que se filtra por ese estado', async () => {
  const { user } = renderScreen(ui());
  expect(screen.queryByText('Vender sellos')).toBeNull();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'descartada');
  expect(screen.getByText('Vender sellos')).toBeTruthy();
  expect(screen.queryByText('App de recetas')).toBeNull();
});

test('filtra por categoría y por tag', async () => {
  const { user } = renderScreen(ui());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'contenido');
  expect(screen.getByText('Canal de vídeo')).toBeTruthy();
  expect(screen.queryByText('App de recetas')).toBeNull();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), '');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'app');
  expect(screen.getByText('App de recetas')).toBeTruthy();
  expect(screen.queryByText('Canal de vídeo')).toBeNull();
});

test('cambiar el estado de una idea la guarda al momento', async () => {
  const { user } = renderScreen(ui());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Estado de «App de recetas»' }), 'en_marcha');
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('a', { status: 'en_marcha' }));
});

test('si no se puede guardar el estado, la idea vuelve al que tenía y se avisa', async () => {
  itemsActions.moveItem.mockResolvedValue(fail('No se pudo.'));
  const { user } = renderScreen(ui());
  const select = screen.getByRole('combobox', { name: 'Estado de «App de recetas»' }) as HTMLSelectElement;
  await user.selectOptions(select, 'explorando');
  expect(await screen.findByText('No se pudo.')).toBeTruthy();
  expect(select.value).toBe('semilla');
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
