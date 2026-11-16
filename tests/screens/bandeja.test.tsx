// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { BandejaScreen } from '@/components/items/BandejaScreen';
import { ok } from '@/lib/actions/result';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const trabajar = makeItem({ id: 'i1', type: 'idea', title: 'Trabajar', needsReview: true, suggestion: { type: 'tarea', confidence: 0.3 }, sourceText: 'Trabajar' });
const funko = makeItem({ id: 'i2', type: 'tarea', title: 'Algo de Funko', needsReview: true, suggestion: { type: 'compra', confidence: 0.4 }, sourceText: 'Algo de Funko, creo que comprar' });
const sinSugerencia = makeItem({ id: 'i3', type: 'tarea', title: 'asdf', needsReview: true, suggestion: null });

const screenOf = (items = [trabajar, funko]) => renderScreen(<BandejaScreen today="2026-11-16" items={items} people={[]} />);

test('cada item dudoso enseña lo que la IA cree que es', () => {
  screenOf();
  expect(screen.getByText('Trabajar')).toBeTruthy();
  expect(screen.getByText('¿Tarea?')).toBeTruthy();
  expect(screen.getByText('¿Compra?')).toBeTruthy();
});

test('Aceptar archiva el item con el tipo sugerido y ofrece Deshacer', async () => {
  const { user } = screenOf();
  await user.click(screen.getByRole('button', { name: 'Aceptar «Trabajar»' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('i1', { type: 'tarea', needsReview: false, suggestion: null }));
  expect(await screen.findByText('Guardado en Tarea')).toBeTruthy();
  expect(screen.queryByText('Trabajar')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Deshacer' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenLastCalledWith('i1', { type: 'idea', needsReview: true, suggestion: { type: 'tarea', confidence: 0.3 } }));
});

test('Cambiar tipo elige otro tipo y lo clasifica', async () => {
  const { user } = screenOf();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Cambiar el tipo de «Trabajar»' }), 'idea');
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('i1', { type: 'idea', needsReview: false, suggestion: null }));
});

test('Descartar manda el item a la papelera y se puede deshacer', async () => {
  const { user } = screenOf();
  await user.click(screen.getByRole('button', { name: 'Descartar «Trabajar»' }));
  await waitFor(() => expect(itemsActions.deleteItem).toHaveBeenCalledWith('i1'));
  expect(await screen.findByText('Eliminado')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Deshacer' }));
  await waitFor(() => expect(itemsActions.undoDelete).toHaveBeenCalledWith('i1'));
});

test('si Aceptar falla, el item vuelve a la lista y se dice', async () => {
  itemsActions.moveItem.mockResolvedValue({ ok: false, error: 'No se ha podido guardar.' });
  const { user } = screenOf();
  await user.click(screen.getByRole('button', { name: 'Aceptar «Trabajar»' }));
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(screen.getByText('Trabajar')).toBeTruthy();
});

test('un item sin sugerencia no ofrece Aceptar, solo elegir tipo o descartar', () => {
  screenOf([sinSugerencia]);
  expect(screen.queryByRole('button', { name: /Aceptar/ })).toBeNull();
  expect(screen.getByRole('combobox', { name: 'Cambiar el tipo de «asdf»' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Descartar «asdf»' })).toBeTruthy();
});

test('sin nada que revisar, un vacío útil', () => {
  screenOf([]);
  expect(screen.getByText(/Todo está clasificado/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Procesar' })).toBeNull();
});

test('procesar: un item cada vez, con A aceptar, D descartar y S saltar', async () => {
  const { user } = screenOf();
  await user.click(screen.getByRole('button', { name: 'Procesar' }));
  const card = screen.getByRole('region', { name: 'Procesar la Bandeja' });
  expect(within(card).getByText('1 de 2')).toBeTruthy();
  expect(within(card).getByText('Trabajar')).toBeTruthy();

  await user.keyboard('s');
  expect(within(card).getByText('Algo de Funko')).toBeTruthy();
  await user.keyboard('a');
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('i2', { type: 'compra', needsReview: false, suggestion: null }));

  expect(await within(card).findByText('Trabajar')).toBeTruthy();
  await user.keyboard('d');
  await waitFor(() => expect(itemsActions.deleteItem).toHaveBeenCalledWith('i1'));
  expect(await screen.findByText('Bandeja vacía')).toBeTruthy();
});

test('procesar: un número elige el tipo y Escape sale', async () => {
  const { user } = screenOf();
  await user.click(screen.getByRole('button', { name: 'Procesar' }));
  await user.keyboard('3');
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledWith('i1', { type: 'compra', needsReview: false, suggestion: null }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'Procesar la Bandeja' })).toBeNull();
});

test('las teclas no hacen nada fuera del modo procesar', async () => {
  const { user } = screenOf();
  await user.keyboard('a');
  await user.keyboard('d');
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
  expect(itemsActions.deleteItem).not.toHaveBeenCalled();
  itemsActions.moveItem.mockResolvedValue(ok(makeItem()));
});
