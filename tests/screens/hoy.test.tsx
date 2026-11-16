// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DayTimeline } from '@/components/hoy/DayTimeline';
import { fail } from '@/lib/actions/result';
import type { DayTimeline as Timeline } from '@/lib/hoy/timeline';
import { itemsActions, makeItem, renderScreen } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const TZ = 'Europe/Madrid';
const TODAY = '2026-10-22';

const timeline = (over: Partial<Timeline> = {}): Timeline => ({
  allDay: [],
  timed: [
    { kind: 'task', time: '09:30', task: { overdue: false, item: makeItem({ id: 't1', title: 'Llamar al banco', dueAt: '2026-10-22T07:30:00.000Z', hasTime: true }) } },
    { kind: 'event', time: '10:00', event: { id: 'e1', title: 'Dentista', startsAt: '2026-10-22T08:00:00.000Z', endsAt: '2026-10-22T09:00:00.000Z' } },
  ],
  untimed: [{ overdue: false, item: makeItem({ id: 't2', title: 'Informe', area: 'trabajo', dueAt: '2026-10-21T22:00:00.000Z' }) }],
  ...over,
});

test('Tu día pinta citas y tareas en orden de hora', () => {
  renderScreen(<DayTimeline timeline={timeline()} today={TODAY} tz={TZ} />);
  const day = screen.getByRole('region', { name: 'Tu día' });
  const text = day.textContent ?? '';
  expect(text.indexOf('Llamar al banco')).toBeLessThan(text.indexOf('Dentista'));
  expect(within(day).getByText('09:30')).toBeTruthy();
});

test('completar una tarea llama a toggleDone y ofrece Deshacer', async () => {
  const { user } = renderScreen(<DayTimeline timeline={timeline()} today={TODAY} tz={TZ} />);
  await user.click(screen.getByRole('checkbox', { name: 'Completar «Llamar al banco»' }));
  await waitFor(() => expect(itemsActions.toggleDone).toHaveBeenCalledWith('t1'));
  expect(await screen.findByRole('button', { name: 'Deshacer' })).toBeTruthy();
});

test('si falla, la tarea vuelve y se dice por qué', async () => {
  itemsActions.toggleDone.mockResolvedValue(fail('Sin conexión'));
  const { user } = renderScreen(<DayTimeline timeline={timeline()} today={TODAY} tz={TZ} />);
  await user.click(screen.getByRole('checkbox', { name: 'Completar «Llamar al banco»' }));
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  expect(screen.getByText('Llamar al banco')).toBeTruthy();
});

test('una tarea de Trabajo lleva la etiqueta Trabajo', () => {
  renderScreen(<DayTimeline timeline={timeline()} today={TODAY} tz={TZ} />);
  const row = screen.getByText('Informe').closest('.ui-row') as HTMLElement;
  expect(within(row).getByText(/Trabajo/)).toBeTruthy();
});
