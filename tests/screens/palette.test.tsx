// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CommandPalette } from '@/components/app/CommandPalette';
import { renderScreen, router } from './setup';

vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));
vi.mock('@/app/actions/palette', () => ({ paletteSearch: vi.fn(async () => ({ ok: true, value: { results: { query: '', groups: [], total: 0 }, projects: [] } })) }));

test('⌘K abre la paleta, «revis» + Intro va a la revisión semanal', async () => {
  const { user } = renderScreen(<CommandPalette />);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  const input = await screen.findByRole('combobox', { name: 'Buscar o hacer algo' });
  await user.type(input, 'revis');
  await user.keyboard('{Enter}');
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/revision'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Esc la cierra', async () => {
  const { user } = renderScreen(<CommandPalette />);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  await screen.findByRole('dialog');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('/ dentro de un campo no la abre; fuera, sí', async () => {
  renderScreen(
    <>
      <input aria-label="Otro campo" />
      <CommandPalette />
    </>,
  );
  fireEvent.keyDown(screen.getByLabelText('Otro campo'), { key: '/' });
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.keyDown(window, { key: '/' });
  expect(await screen.findByRole('dialog')).toBeTruthy();
});

test('las flechas eligen otra acción', async () => {
  const { user } = renderScreen(<CommandPalette />);
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  const input = await screen.findByRole('combobox', { name: 'Buscar o hacer algo' });
  await user.type(input, 'ir a ');
  await user.keyboard('{ArrowDown}{Enter}');
  await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
  expect(router.push.mock.calls[0][0]).not.toBe('/hoy');
});
