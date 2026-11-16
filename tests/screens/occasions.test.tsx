// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { OccasionsSection } from '@/components/items/OccasionsSection';
import { PeopleSection } from '@/components/items/PeopleSection';
import type { UpcomingDate } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';
import { occasionsWithGifts } from '@/lib/regalos';
import { makeItem, renderScreen } from './setup';

vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const ana = { id: 'p1', name: 'Ana', birthday: '1990-12-01' } as unknown as Person;
const up = (daysUntil: number, label = 'Cumpleaños'): UpcomingDate => ({ person: ana, kind: 'birthday', dateId: null, label, date: '2026-12-01', daysUntil });
const gift = (status: string) => makeItem({ id: 'g', type: 'regalo', title: 'Libro', status, personId: 'p1', area: null, data: {} });

test('una ocasión cercana sin regalo comprado lo dice con un aviso', () => {
  renderScreen(<OccasionsSection occasions={occasionsWithGifts([up(12)], [gift('idea')])} />);
  expect(screen.getByText('Ana · Cumpleaños')).toBeTruthy();
  expect(screen.getByText(/en 12 días/)).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toMatch(/Sin regalo comprado/);
  expect(screen.getByText(/1 idea/)).toBeTruthy();
});

test('con el regalo comprado no hay aviso y lo dice', () => {
  renderScreen(<OccasionsSection occasions={occasionsWithGifts([up(12)], [gift('comprado')])} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText(/Regalo comprado/)).toBeTruthy();
});

test('una ocasión lejana se lista sin aviso', () => {
  renderScreen(<OccasionsSection occasions={occasionsWithGifts([up(90)], [])} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Ana · Cumpleaños')).toBeTruthy();
});

test('cada ocasión lleva a la ficha de la persona', () => {
  renderScreen(<OccasionsSection occasions={occasionsWithGifts([up(12)], [])} />);
  expect(screen.getByRole('link', { name: /Ana · Cumpleaños/ }).getAttribute('href')).toBe('/personas/p1');
});

test('sin ocasiones próximas no pinta nada', () => {
  const { container } = renderScreen(<OccasionsSection occasions={[]} />);
  expect(container.textContent).toBe('');
});

test('Personas con ideas resume los regalos de cada persona', () => {
  renderScreen(<PeopleSection groups={[{ person: ana, count: 3, summary: '2 ideas · 1 comprado' }]} />);
  expect(screen.getByText(/2 ideas · 1 comprado/)).toBeTruthy();
});
