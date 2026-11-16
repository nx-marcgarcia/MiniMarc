// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { LibrosScreen } from '@/components/libros/LibrosScreen';
import { makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const book = (id: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'libro', title: `Libro ${id}`, status: 'por_leer', readingState: 'por_leer', area: null, data: {}, ...over });

test('muestra la portada automática de un libro que no tiene foto propia', () => {
  const { container } = renderScreen(<LibrosScreen books={[book('a', { data: { cover: 'https://covers.openlibrary.org/b/id/7-M.jpg' } })]} photos={{}} />);
  expect(container.querySelector('img[src="https://covers.openlibrary.org/b/id/7-M.jpg"]')).not.toBeNull();
});

test('una foto subida manda sobre la portada automática', () => {
  const photos = { a: [{ id: 'ph', url: 'https://signed.test/mine.jpg' }] } as unknown as Parameters<typeof LibrosScreen>[0]['photos'];
  const { container } = renderScreen(<LibrosScreen books={[book('a', { data: { cover: 'https://covers.openlibrary.org/b/id/7-M.jpg' } })]} photos={photos} />);
  expect(container.querySelector('img[src="https://signed.test/mine.jpg"]')).not.toBeNull();
  expect(container.querySelector('img[src="https://covers.openlibrary.org/b/id/7-M.jpg"]')).toBeNull();
});

test('sin portada ni foto sale el icono de libro y el autor bajo el título', () => {
  const { container } = renderScreen(<LibrosScreen books={[book('a', { author: 'James Clear' })]} photos={{}} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('James Clear')).toBeTruthy();
});

test('la fila de un libro valorado enseña sus estrellas', () => {
  renderScreen(<LibrosScreen books={[book('a', { data: { rating: 4 } }), book('b')]} photos={{}} />);
  expect(screen.getAllByLabelText('Valoración: 4 de 5')).toHaveLength(1);
  expect(screen.getByLabelText('Valoración: 4 de 5').textContent).toBe('★★★★☆');
});

test('valorar un libro desde su hoja guarda la valoración sin perder la portada', async () => {
  const { itemsActions } = await import('./setup');
  const { user } = renderScreen(<LibrosScreen books={[book('a', { data: { cover: 'https://covers.openlibrary.org/b/id/7-M.jpg' } })]} photos={{}} />);
  await user.click(screen.getByRole('button', { name: 'Abrir «Libro a»' }));
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Valoración' }), '4');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await vi.waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalled());
  const [id, patch] = itemsActions.moveItem.mock.calls[0];
  expect(id).toBe('a');
  expect(patch.data).toEqual({ cover: 'https://covers.openlibrary.org/b/id/7-M.jpg', rating: 4 });
});
