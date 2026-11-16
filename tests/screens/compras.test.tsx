// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ComprasScreen } from '@/components/compras/ComprasScreen';
import { fail } from '@/lib/actions/result';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('@/app/actions/photos', () => ({ addPhoto: vi.fn(), deletePhoto: vi.fn() }));
vi.mock('@/lib/supabase/browser', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const compra = (id: string, title: string, over: Record<string, unknown> = {}) =>
  makeItem({ id, type: 'compra', title, status: 'quiero', area: null, data: { quantity: 1, currency: 'EUR' }, ...over });

const stores = [
  { id: 's1', name: 'Aliexpress', domain: 'aliexpress.com', favicon: 'https://aliexpress.com/favicon.ico' },
  { id: 's2', name: 'Casio', domain: 'casio.com', favicon: null },
];
const items = [
  compra('a', 'Masaje de cabeza', { storeId: 's1', data: { quantity: 2, currency: 'EUR', price: 10 } }),
  compra('b', 'Cajón organizador', { storeId: 's1', data: { quantity: 1, currency: 'EUR', price: 5, urgency: 'alta' } }),
  compra('c', 'Reloj Casio', { storeId: 's2' }),
  compra('d', 'Leche'),
];
const history = [compra('h', 'Auriculares', { status: 'comprado', storeId: 's2', data: { quantity: 1, currency: 'EUR', price: 40 } })];

const ui = (over: Partial<Parameters<typeof ComprasScreen>[0]> = {}) => (
  <ComprasScreen today="2026-11-16" items={items} history={history} stores={stores} {...over} />
);

test('agrupa por tienda, con el número de compras y el total estimado', () => {
  renderScreen(ui());
  const header = screen.getByRole('button', { name: /Aliexpress/ });
  expect(header.textContent).toContain('2');
  expect(header.textContent).toMatch(/25,00\s€/);
  expect(screen.getByRole('button', { name: /^Casio, 1 compra/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Sin tienda, 1 compra/ })).toBeTruthy();
  expect(header.getAttribute('aria-label')).toMatch(/^Aliexpress, 2 compras, 25,00\s€$/);
});

test('"Sin tienda" va la última', () => {
  renderScreen(ui());
  const names = screen.getAllByRole('button', { name: /^(Aliexpress|Casio|Sin tienda),/ }).map((b) => b.getAttribute('aria-label'));
  expect(names.map((n) => n?.split(',')[0])).toEqual(['Aliexpress', 'Casio', 'Sin tienda']);
});

test('cada compra enseña su cantidad y precio', () => {
  renderScreen(ui());
  expect(screen.getByText(/2 × 10,00\s€/)).toBeTruthy();
});

test('plegar una tienda esconde sus compras y desplegarla las devuelve', async () => {
  const { user } = renderScreen(ui());
  expect(screen.getByText('Masaje de cabeza')).toBeTruthy();
  const header = screen.getByRole('button', { name: /Aliexpress/ });
  expect(header.getAttribute('aria-expanded')).toBe('true');
  await user.click(header);
  expect(screen.queryByText('Masaje de cabeza')).toBeNull();
  expect(screen.getByRole('button', { name: /Aliexpress/ }).getAttribute('aria-expanded')).toBe('false');
  await user.click(screen.getByRole('button', { name: /Aliexpress/ }));
  expect(screen.getByText('Masaje de cabeza')).toBeTruthy();
});

test('por urgencia: lo urgente primero', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('radio', { name: 'Por urgencia' }));
  expect(screen.getByText('Urgente')).toBeTruthy();
  expect(screen.getByText('Sin urgencia')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Aliexpress/ })).toBeNull();
});

test('el historial lista lo comprado y permite volver a la lista', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('radio', { name: 'Historial' }));
  expect(screen.getByText('Auriculares')).toBeTruthy();
  expect(screen.getByText(/40,00\s€/)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Volver a la lista «Auriculares»' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('h', { status: 'quiero' }));
});

test('historial vacío: un texto útil', async () => {
  const { user } = renderScreen(ui({ history: [] }));
  await user.click(screen.getByRole('radio', { name: 'Historial' }));
  expect(screen.getByText(/Aquí aparecerá lo que compres/)).toBeTruthy();
});

test('sin compras, un vacío con ejemplo de qué escribir', () => {
  renderScreen(ui({ items: [] }));
  expect(screen.getByText(/Aliexpress: masaje de cabeza/)).toBeTruthy();
});

test('"En la tienda": lista grande y al tocar una compra se marca comprada', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'En la tienda' }));
  const list = screen.getByRole('region', { name: 'En la tienda' });
  expect(within(list).getByText('Masaje de cabeza')).toBeTruthy();
  await user.click(within(list).getByRole('button', { name: 'Masaje de cabeza' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledWith('a'));
  expect(within(list).getByRole('button', { name: 'Masaje de cabeza' }).getAttribute('aria-pressed')).toBe('true');
  // Tocar otra vez la devuelve a la lista.
  await user.click(within(list).getByRole('button', { name: 'Masaje de cabeza' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledTimes(2));
  expect(within(list).getByRole('button', { name: 'Masaje de cabeza' }).getAttribute('aria-pressed')).toBe('false');
});

test('"En la tienda" se puede limitar a una tienda', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'En la tienda' }));
  const list = screen.getByRole('region', { name: 'En la tienda' });
  await user.selectOptions(within(list).getByRole('combobox', { name: 'Tienda' }), 's2');
  expect(within(list).getByText('Reloj Casio')).toBeTruthy();
  expect(within(list).queryByText('Masaje de cabeza')).toBeNull();
});

test('si marcar comprada falla, la compra vuelve y se dice', async () => {
  itemsActions.toggleDone.mockResolvedValue(fail('No se ha podido guardar.'));
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'En la tienda' }));
  const list = screen.getByRole('region', { name: 'En la tienda' });
  await user.click(within(list).getByRole('button', { name: 'Reloj Casio' }));
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(within(list).getByRole('button', { name: 'Reloj Casio' }).getAttribute('aria-pressed')).toBe('false');
});

test('Salir vuelve a la lista', async () => {
  const { user } = renderScreen(ui());
  await user.click(screen.getByRole('button', { name: 'En la tienda' }));
  await user.click(screen.getByRole('button', { name: 'Salir' }));
  expect(screen.queryByRole('region', { name: 'En la tienda' })).toBeNull();
  expect(screen.getByRole('button', { name: /Aliexpress/ })).toBeTruthy();
});
