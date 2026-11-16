// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { EnlacesScreen } from '@/components/enlaces/EnlacesScreen';
import { fail } from '@/lib/actions/result';
import { toCards } from '@/lib/enlaces';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const enlace = (id: string, title: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'enlace', title, status: 'por_ver', area: null, data: {}, ...over });

const items = [
  enlace('a', 'Receta de tortilla', { data: { kind: 'video' }, link: 'https://www.youtube.com/watch?v=1', linkImage: 'https://i.ytimg.com/1.jpg' }),
  enlace('b', 'Truco de cocina', { data: { kind: 'short' }, link: 'https://www.tiktok.com/@x/video/2' }),
  enlace('c', 'Cómo montar un blog', { data: { kind: 'articulo' }, link: 'https://blog.example.com/p', status: 'visto' }),
];
const ui = (cards = toCards(items, [])) => <EnlacesScreen cards={cards} />;

test('lista lo que está por ver, con su dominio y su tipo, y cada título es un enlace', () => {
  renderScreen(ui());
  const a = screen.getByRole('link', { name: 'Receta de tortilla' });
  expect(a.getAttribute('href')).toBe('https://www.youtube.com/watch?v=1');
  expect(a.getAttribute('target')).toBe('_blank');
  expect(screen.getByText(/Vídeo · youtube\.com/)).toBeTruthy();
  expect(screen.getByText(/Short · tiktok\.com/)).toBeTruthy();
  expect(screen.queryByText('Cómo montar un blog')).toBeNull();
});

test('muestra la miniatura de la página cuando la hay', () => {
  const { container } = renderScreen(ui());
  expect(container.querySelector('img[src="https://i.ytimg.com/1.jpg"]')).not.toBeNull();
});

test('la pestaña Vistos enseña lo ya visto', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('radio', { name: 'Vistos' }));
  expect(screen.getByText('Cómo montar un blog')).toBeTruthy();
  expect(screen.queryByText('Receta de tortilla')).toBeNull();
});

test('filtra por tipo', async () => {
  const { user } = renderScreen(ui());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'short');
  expect(screen.getByText('Truco de cocina')).toBeTruthy();
  expect(screen.queryByText('Receta de tortilla')).toBeNull();
});

test('filtra por dominio', async () => {
  const { user } = renderScreen(ui());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Dominio' }), 'youtube.com');
  expect(screen.getByText('Receta de tortilla')).toBeTruthy();
  expect(screen.queryByText('Truco de cocina')).toBeNull();
});

test('marcar como visto lo pasa a Vistos y se puede deshacer', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Marcar «Receta de tortilla» como visto' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledWith('a'));
  expect(screen.queryByText('Receta de tortilla')).toBeNull();
  await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledTimes(2));
});

test('en Vistos se puede volver a ponerlo por ver', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('radio', { name: 'Vistos' }));
  await user.click(screen.getByRole('button', { name: 'Volver «Cómo montar un blog» a por ver' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledWith('c'));
});

test('eliminar manda a la papelera y se puede deshacer', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Eliminar «Truco de cocina»' }));
  await waitFor(() => expect(itemsActions.deleteItem).toHaveBeenCalledWith('b'));
  expect(screen.queryByText('Truco de cocina')).toBeNull();
  await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
  await waitFor(() => expect(itemsActions.undoDelete).toHaveBeenCalledWith('b'));
});

test('si marcar como visto falla, el enlace vuelve y se dice', async () => {
  itemsActions.toggleDone.mockResolvedValue(fail('No se ha podido guardar.'));
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'Marcar «Receta de tortilla» como visto' }));
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(screen.getByText('Receta de tortilla')).toBeTruthy();
});

test('sin nada guardado, un vacío con ejemplo de qué hacer', () => {
  renderScreen(ui([]));
  expect(screen.getByText(/Pega un enlace en la barra de arriba/)).toBeTruthy();
});

test('los filtros solo aparecen si hay algo que filtrar', () => {
  renderScreen(ui(toCards([enlace('a', 'Solo uno')], [])));
  expect(screen.queryByRole('combobox', { name: 'Tipo' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Dominio' })).toBeNull();
});
