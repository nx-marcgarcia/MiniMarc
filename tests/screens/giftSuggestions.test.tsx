// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { GiftSuggestions } from '@/components/people/GiftSuggestions';
import { fail, ok } from '@/lib/actions/result';
import { makeItem, renderScreen } from './setup';

const actions = vi.hoisted(() => ({ suggestGiftIdeas: vi.fn(), addSuggestedGift: vi.fn() }));
vi.mock('@/app/actions/regalos', () => actions);

beforeEach(() => {
  actions.suggestGiftIdeas.mockReset();
  actions.addSuggestedGift.mockReset();
});

const IDEAS = [
  { title: 'Libro de cocina japonesa', reason: 'Le gusta cocinar', approxPrice: 25 },
  { title: 'Delantal', reason: 'Para cocinar' },
];

test('pulsar Sugerir ideas lista las ideas con motivo y precio, sin guardar nada', async () => {
  actions.suggestGiftIdeas.mockResolvedValue(ok(IDEAS));
  const { user } = renderScreen(<GiftSuggestions personId="p1" />);
  await user.click(screen.getByRole('button', { name: 'Sugerir ideas' }));
  expect(await screen.findByText('Libro de cocina japonesa')).toBeTruthy();
  expect(screen.getByText(/Le gusta cocinar · ≈ 25,00/)).toBeTruthy();
  expect(actions.suggestGiftIdeas).toHaveBeenCalledWith('p1', undefined);
  expect(actions.addSuggestedGift).not.toHaveBeenCalled();
});

test('Añadir guarda esa idea y la marca como añadida', async () => {
  actions.suggestGiftIdeas.mockResolvedValue(ok(IDEAS));
  actions.addSuggestedGift.mockResolvedValue(ok(makeItem()));
  const { user } = renderScreen(<GiftSuggestions personId="p1" />);
  await user.click(screen.getByRole('button', { name: 'Sugerir ideas' }));
  await user.click(await screen.findByRole('button', { name: 'Añadir «Delantal»' }));
  await waitFor(() => expect(actions.addSuggestedGift).toHaveBeenCalledWith('p1', IDEAS[1]));
  expect(await screen.findByText('Añadida')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Añadir «Libro de cocina japonesa»' })).toBeTruthy();
});

test('si la IA falla muestra el aviso y deja volver a intentarlo', async () => {
  actions.suggestGiftIdeas.mockResolvedValue(fail('No he podido pensar ideas ahora.'));
  const { user } = renderScreen(<GiftSuggestions personId="p1" />);
  await user.click(screen.getByRole('button', { name: 'Sugerir ideas' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/No he podido pensar ideas/);
  expect(screen.getByRole('button', { name: 'Sugerir ideas' })).toBeTruthy();
});

test('si la acción ni siquiera responde (sin conexión) no se rompe', async () => {
  actions.suggestGiftIdeas.mockRejectedValue(new Error('offline'));
  const { user } = renderScreen(<GiftSuggestions personId="p1" />);
  await user.click(screen.getByRole('button', { name: 'Sugerir ideas' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/No se ha podido conectar/);
});

test('pasa la ocasión a la petición', async () => {
  actions.suggestGiftIdeas.mockResolvedValue(ok([]));
  const { user } = renderScreen(<GiftSuggestions personId="p1" occasion="Cumpleaños" />);
  await user.click(screen.getByRole('button', { name: 'Sugerir ideas' }));
  await waitFor(() => expect(actions.suggestGiftIdeas).toHaveBeenCalledWith('p1', 'Cumpleaños'));
  expect(await screen.findByText(/No se me ocurre nada nuevo/)).toBeTruthy();
});
