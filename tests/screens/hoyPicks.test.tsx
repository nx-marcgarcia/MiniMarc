// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { HoyPicks } from '@/components/hoy/HoyPicks';
import { fail, ok } from '@/lib/actions/result';
import type { HoyPicks as Picks } from '@/lib/hoy/picks';
import { itemsActions, makeItem, renderScreen, router } from './setup';

const focus = vi.hoisted(() => ({ setHoyFocus: vi.fn() }));
vi.mock('@/app/actions/focus', () => focus);
vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

beforeEach(() => {
  focus.setHoyFocus.mockReset();
  focus.setHoyFocus.mockResolvedValue(ok(null));
});

const task = (id: string, over = {}) => makeItem({ id, type: 'tarea', title: `Tarea ${id}`, dueAt: null, data: {}, ...over });
const picks = (over: Partial<Picks> = {}): Picks => ({ priority: null, quick: [], choices: [], ...over });
const ui = (p: Picks) => <HoyPicks picks={p} today="2026-11-17" />;

test('sin nada que elegir no pinta nada', () => {
  const { container } = renderScreen(ui(picks()));
  expect(container.textContent).toBe('');
});

test('sin prioridad ofrece elegirla; al abrir la lista, Elegir la guarda y recarga Hoy', async () => {
  const { user } = renderScreen(ui(picks({ choices: [task('a'), task('b')] })));
  expect(screen.queryByRole('button', { name: /Elegir como prioridad/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Elegir mi prioridad de hoy' }));
  await user.click(screen.getByRole('button', { name: 'Elegir como prioridad: Tarea b' }));
  await waitFor(() => expect(focus.setHoyFocus).toHaveBeenCalledWith('b'));
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
});

test('con prioridad la enseña con Hecho y Quitar, y no ofrece la lista', async () => {
  const { user } = renderScreen(ui(picks({ priority: task('p', { title: 'Enviar el CV' }), choices: [task('a')] })));
  expect(screen.getByText('Tu prioridad de hoy')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Elegir mi prioridad de hoy' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Hecho: Enviar el CV' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledWith('p'));
  await user.click(screen.getByRole('button', { name: 'Quitar la prioridad: Enviar el CV' }));
  await waitFor(() => expect(focus.setHoyFocus).toHaveBeenCalledWith(null));
});

test('«Si tienes 15 minutos» enseña la duración y deja marcar como hecha o como prioridad', async () => {
  const { user } = renderScreen(ui(picks({ quick: [task('q', { title: 'Pagar la luz', data: { estimateMin: 10 } })] })));
  expect(screen.getByText('Si tienes 15 minutos')).toBeTruthy();
  expect(screen.getByText('10 min')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Mi prioridad: Pagar la luz' }));
  await waitFor(() => expect(focus.setHoyFocus).toHaveBeenCalledWith('q'));
});

test('si falla, lo dice y no recarga', async () => {
  focus.setHoyFocus.mockResolvedValue(fail('No se ha podido guardar.'));
  const { user } = renderScreen(ui(picks({ quick: [task('q', { title: 'Pagar la luz', data: { estimateMin: 10 } })] })));
  await user.click(screen.getByRole('button', { name: 'Mi prioridad: Pagar la luz' }));
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(router.refresh).not.toHaveBeenCalled();
});
