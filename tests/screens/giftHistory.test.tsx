// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { GiftHistory } from '@/components/people/GiftHistory';
import { renderScreen } from './setup';

test('lista lo entregado con año y ocasión', () => {
  renderScreen(<GiftHistory rows={[{ id: 'a', title: 'Libro de cocina', year: 2025, occasion: 'Navidad', price: null }]} />);
  expect(screen.getByText('Regalos entregados')).toBeTruthy();
  expect(screen.getByText('Libro de cocina')).toBeTruthy();
  expect(screen.getByText('2025 · Navidad')).toBeTruthy();
});

test('sin historial no pinta nada', () => {
  const { container } = renderScreen(<GiftHistory rows={[]} />);
  expect(container.textContent).toBe('');
});
