// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CaptureBar } from '@/components/CaptureBar';
import { fail, ok } from '@/lib/actions/result';
import { captureActions, followUpActions, renderScreen, router } from './setup';

vi.mock('@/app/actions/capture', () => import('./setup').then((m) => m.captureActionsModule));
vi.mock('@/app/actions/captureFollowUp', () => import('./setup').then((m) => m.followUpActionsModule));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const field = () => screen.getByRole('textbox', { name: 'Apunta algo' }) as HTMLInputElement;

const understood = {
  lines: ['2 compras en Aliexpress', 'Regalo para Rosendo · Cumpleaños 14 ene'],
  eventIds: ['e1'],
  logId: 'log-1',
  items: [
    { id: 'a', type: 'compra', title: 'Masaje de cabeza', needsReview: false, personId: null, storeId: 's1', storeName: 'Aliexpress' },
    { id: 'b', type: 'compra', title: 'Cajón organizador', needsReview: false, personId: null, storeId: 's1', storeName: 'Aliexpress' },
    { id: 'g', type: 'regalo', title: 'Caja para relojes', needsReview: false, personId: 'p1', personName: 'Rosendo', storeId: null },
  ],
};

async function capture() {
  captureActions.quickCapture.mockResolvedValue(ok({ message: 'Guardado en Compras y Regalos', href: '/bandeja', understood }));
  followUpActions.listCaptureChoices.mockResolvedValue(
    ok({ people: [{ id: 'p1', name: 'Rosendo' }, { id: 'p2', name: 'Aina' }], stores: [{ id: 's1', name: 'Aliexpress' }, { id: 's2', name: 'Casio' }] }),
  );
  const view = renderScreen(<CaptureBar />);
  await view.user.type(field(), 'Aliexpress: masaje, cajón; regalo para Rosendo caja');
  await view.user.keyboard('{Enter}');
  await screen.findByText('2 compras en Aliexpress');
  return view;
}

test('tras capturar, la tarjeta cuenta lo que ha entendido', async () => {
  await capture();
  expect(screen.getByText('Regalo para Rosendo · Cumpleaños 14 ene')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
});

test('cada item tiene chips para cambiar su tipo, y el regalo su persona y la compra su tienda', async () => {
  await capture();
  expect(screen.getByRole('combobox', { name: 'Tipo de «Masaje de cabeza»' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Tienda de «Masaje de cabeza»' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Persona de «Caja para relojes»' })).toBeTruthy();
  // Una compra no tiene persona ni un regalo tienda.
  expect(screen.queryByRole('combobox', { name: 'Persona de «Masaje de cabeza»' })).toBeNull();
  expect(screen.queryByRole('combobox', { name: 'Tienda de «Caja para relojes»' })).toBeNull();
});

test('cambiar el tipo con un chip lo corrige en el servidor con el id del registro', async () => {
  const { user } = await capture();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de «Masaje de cabeza»' }), 'idea');
  await waitFor(() => expect(followUpActions.correctCapture).toHaveBeenCalledTimes(1));
  expect(followUpActions.correctCapture).toHaveBeenCalledWith({ logId: 'log-1', itemId: 'a', patch: { type: 'idea' } });
});

test('cambiar la persona y la tienda con sus chips', async () => {
  const { user } = await capture();
  await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Persona de «Caja para relojes»' })).getByRole('option', { name: 'Aina' })).toBeTruthy());
  await user.selectOptions(screen.getByRole('combobox', { name: 'Persona de «Caja para relojes»' }), 'p2');
  expect(followUpActions.correctCapture).toHaveBeenCalledWith({ logId: 'log-1', itemId: 'g', patch: { personId: 'p2' } });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tienda de «Cajón organizador»' }), 's2');
  expect(followUpActions.correctCapture).toHaveBeenCalledWith({ logId: 'log-1', itemId: 'b', patch: { storeId: 's2' } });
});

test('Deshacer manda a la papelera lo creado y las citas, y avisa', async () => {
  const { user } = await capture();
  await user.click(screen.getByRole('button', { name: 'Deshacer' }));
  await waitFor(() => expect(followUpActions.undoCapture).toHaveBeenCalledTimes(1));
  expect(followUpActions.undoCapture).toHaveBeenCalledWith({ itemIds: ['a', 'b', 'g'], eventIds: ['e1'] });
  expect(await screen.findByText('Captura deshecha')).toBeTruthy();
});

test('Editar lleva a la Bandeja (Últimas 24 h), donde se edita cada item', async () => {
  const { user } = await capture();
  await user.click(screen.getByRole('button', { name: 'Editar' }));
  expect(router.push).toHaveBeenCalledWith('/bandeja');
});

test('si una corrección falla, lo dice y el chip vuelve a su valor', async () => {
  followUpActions.correctCapture.mockResolvedValue(fail('No se ha podido guardar.'));
  const { user } = await capture();
  const select = screen.getByRole('combobox', { name: 'Tipo de «Masaje de cabeza»' }) as HTMLSelectElement;
  await user.selectOptions(select, 'idea');
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(select.value).toBe('compra');
});

test('un posible duplicado ofrece fusionarlo', async () => {
  captureActions.quickCapture.mockResolvedValue(
    ok({
      message: 'Guardado en Compras',
      href: '/bandeja',
      understood: { ...understood, lines: ['1 compra'], items: [{ ...understood.items[0], duplicateOf: 'old' }] },
    }),
  );
  const { user } = renderScreen(<CaptureBar />);
  await user.type(field(), 'masaje de cabeza');
  await user.keyboard('{Enter}');
  expect(await screen.findByText('Ya tenías algo parecido')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Es el mismo' }));
  await waitFor(() => expect(followUpActions.mergeCaptureDuplicate).toHaveBeenCalledWith('a', 'old'));
});

test('lo dudoso avisa de que ha ido a la Bandeja y deja elegir el tipo', async () => {
  captureActions.quickCapture.mockResolvedValue(
    ok({
      message: 'Guardado en Sin clasificar',
      href: '/sin-clasificar',
      understood: {
        lines: ['«Trabajar» a la Bandeja (¿tarea?)'],
        eventIds: [],
        logId: 'log-2',
        items: [{ id: 'x', type: 'idea', title: 'Trabajar', needsReview: true, personId: null, storeId: null }],
      },
    }),
  );
  const { user } = renderScreen(<CaptureBar />);
  await user.type(field(), 'Trabajar');
  await user.keyboard('{Enter}');
  expect(await screen.findByText('«Trabajar» a la Bandeja (¿tarea?)')).toBeTruthy();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de «Trabajar»' }), 'tarea');
  expect(followUpActions.correctCapture).toHaveBeenCalledWith({ logId: 'log-2', itemId: 'x', patch: { type: 'tarea' } });
});

test('sin explicación (un chip de tipo), sigue el aviso sencillo de siempre', async () => {
  captureActions.quickCapture.mockResolvedValue(ok({ message: 'Guardado en Ideas', href: '/ideas' }));
  const { user } = renderScreen(<CaptureBar />);
  await user.type(field(), 'una idea');
  await user.keyboard('{Enter}');
  expect(await screen.findByText('Guardado en Ideas')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
});
