// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { ParaHoy } from '@/components/hoy/ParaHoy';
import { fail, ok } from '@/lib/actions/result';
import type { Candidate } from '@/lib/resurfacing/candidates';
import { renderScreen } from './setup';

const actions = vi.hoisted(() => ({ resurfaceAct: vi.fn() }));
vi.mock('@/app/actions/resurfacing', () => actions);
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

beforeEach(() => {
  actions.resurfaceAct.mockReset();
  actions.resurfaceAct.mockResolvedValue(ok('Hecha ✓'));
});

const c = (over: Partial<Candidate> = {}): Candidate => ({ subject: 'item:a', itemId: 'a', kind: 'atrasada', urgent: true, rank: 1, title: 'Llamar al seguro', href: '/tareas?area=personal', detail: 'Venció hace 3 días', askArchive: false, ...over });

test('lista lo pendiente con su motivo y los cuatro botones', () => {
  renderScreen(<ParaHoy candidates={[c()]} />);
  expect(screen.getByText('Para hoy')).toBeTruthy();
  expect(screen.getByText('Llamar al seguro')).toBeTruthy();
  expect(screen.getByText('Atrasada')).toBeTruthy();
  expect(screen.getByText('Venció hace 3 días')).toBeTruthy();
  for (const name of ['Hecho', 'Posponer 1 semana', 'Archivar']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
  expect(screen.getByRole('link', { name: /Abrir/ }).getAttribute('href')).toBe('/tareas?area=personal');
});

test('sin nada que traer no pinta el bloque', () => {
  const { container } = renderScreen(<ParaHoy candidates={[]} />);
  expect(container.textContent).toBe('');
});

test('Hecho llama a la acción con el aviso, quita la fila y lo dice', async () => {
  const { user } = renderScreen(<ParaHoy candidates={[c(), c({ subject: 'item:b', itemId: 'b', title: 'Otra' })]} />);
  await user.click(screen.getByRole('button', { name: /Hecho.*Llamar al seguro/ }));
  await waitFor(() => expect(actions.resurfaceAct).toHaveBeenCalledWith({ subject: 'item:a', itemId: 'a', kind: 'atrasada' }, 'hecho'));
  await waitFor(() => expect(screen.queryByText('Llamar al seguro')).toBeNull());
  expect(screen.getByText('Otra')).toBeTruthy();
  expect(await screen.findByText('Hecha ✓')).toBeTruthy();
});

test('Posponer y Archivar mandan su acción', async () => {
  const { user } = renderScreen(<ParaHoy candidates={[c(), c({ subject: 'item:b', itemId: 'b', title: 'Otra' })]} />);
  await user.click(screen.getByRole('button', { name: /Posponer 1 semana.*Llamar al seguro/ }));
  await waitFor(() => expect(actions.resurfaceAct).toHaveBeenCalledWith(expect.objectContaining({ subject: 'item:a' }), 'posponer'));
  await user.click(screen.getByRole('button', { name: /Archivar.*Otra/ }));
  await waitFor(() => expect(actions.resurfaceAct).toHaveBeenCalledWith(expect.objectContaining({ subject: 'item:b' }), 'archivar'));
});

test('si la acción falla, la fila vuelve y se avisa', async () => {
  actions.resurfaceAct.mockResolvedValue(fail('No se ha podido guardar.'));
  const { user } = renderScreen(<ParaHoy candidates={[c()]} />);
  await user.click(screen.getByRole('button', { name: /Hecho/ }));
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(screen.getByText('Llamar al seguro')).toBeTruthy();
});

test('si ni siquiera responde (sin conexión), también vuelve y se avisa', async () => {
  actions.resurfaceAct.mockRejectedValue(new Error('offline'));
  const { user } = renderScreen(<ParaHoy candidates={[c()]} />);
  await user.click(screen.getByRole('button', { name: /Hecho/ }));
  expect(await screen.findByText(/Revisa la conexión/)).toBeTruthy();
  expect(screen.getByText('Llamar al seguro')).toBeTruthy();
});

test('un cumpleaños sin regalo solo se puede posponer o abrir', () => {
  renderScreen(<ParaHoy candidates={[c({ subject: 'date:p1:2026-11-20', itemId: null, kind: 'regalo_sin_comprar', title: 'Regalo para Ana', href: '/personas/p1', detail: 'Cumpleaños en 3 días · sin regalo comprado' })]} />);
  expect(screen.queryByRole('button', { name: /Hecho/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Archivar/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Posponer 1 semana/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: /Abrir/ }).getAttribute('href')).toBe('/personas/p1');
});

test('un item pospuesto tres veces pregunta si se archiva', () => {
  renderScreen(<ParaHoy candidates={[c({ kind: 'idea_olvidada', itemId: 'a', askArchive: true, detail: 'Sin tocar hace 40 días' })]} />);
  expect(screen.getByText('Lo has pospuesto 3 veces. ¿Lo archivo?')).toBeTruthy();
});
