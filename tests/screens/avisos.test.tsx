// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { AvisosSection } from '@/components/ajustes/AvisosSection';
import { DigestSection } from '@/components/ajustes/DigestSection';
import { WeeklySection } from '@/components/ajustes/WeeklySection';
import { fail, ok } from '@/lib/actions/result';
import { renderScreen } from './setup';

const actions = vi.hoisted(() => ({ setNotifications: vi.fn(), setDigestHour: vi.fn(), setWeeklyDigest: vi.fn() }));
vi.mock('@/app/actions/settings', () => actions);

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue(ok(undefined));
});

const props = { notifyPush: true, notifyTelegram: true, skipHolidays: true, reminderTimes: ['11:00', '13:30', '15:30'], telegramConfigured: true };

test('enseña los canales, las tres horas y los festivos', () => {
  renderScreen(<AvisosSection {...props} />);
  expect(screen.getByRole('switch', { name: 'Telegram' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('switch', { name: 'Notificaciones del navegador' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('switch', { name: 'Saltar festivos' }).getAttribute('aria-checked')).toBe('true');
  expect((screen.getByLabelText('Recordatorio 1') as HTMLInputElement).value).toBe('11:00');
  expect((screen.getByLabelText('Recordatorio 2') as HTMLInputElement).value).toBe('13:30');
  expect((screen.getByLabelText('Recordatorio 3') as HTMLInputElement).value).toBe('15:30');
});

test('apagar Telegram lo guarda al momento', async () => {
  const { user } = renderScreen(<AvisosSection {...props} />);
  await user.click(screen.getByRole('switch', { name: 'Telegram' }));
  await waitFor(() => expect(actions.setNotifications).toHaveBeenCalledWith({ notifyTelegram: false }));
  expect(screen.getByRole('switch', { name: 'Telegram' }).getAttribute('aria-checked')).toBe('false');
});

test('apagar las notificaciones del navegador y saltar festivos también', async () => {
  const { user } = renderScreen(<AvisosSection {...props} />);
  await user.click(screen.getByRole('switch', { name: 'Notificaciones del navegador' }));
  await waitFor(() => expect(actions.setNotifications).toHaveBeenCalledWith({ notifyPush: false }));
  await user.click(screen.getByRole('switch', { name: 'Saltar festivos' }));
  await waitFor(() => expect(actions.setNotifications).toHaveBeenCalledWith({ skipHolidays: false }));
});

test('cambiar una hora guarda las tres, ordenadas', async () => {
  renderScreen(<AvisosSection {...props} />);
  fireEvent.change(screen.getByLabelText('Recordatorio 1'), { target: { value: '14:45' } });
  await waitFor(() => expect(actions.setNotifications).toHaveBeenCalledWith({ reminderTimes: ['13:30', '14:45', '15:30'] }));
});

test('si no se puede guardar, el interruptor vuelve y se avisa', async () => {
  actions.setNotifications.mockResolvedValue(fail('No se ha podido guardar.'));
  const { user } = renderScreen(<AvisosSection {...props} />);
  await user.click(screen.getByRole('switch', { name: 'Telegram' }));
  expect(await screen.findByText('No se ha podido guardar.')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Telegram' }).getAttribute('aria-checked')).toBe('true');
});

test('una hora fuera de la ventana vuelve a la anterior con el aviso del servidor', async () => {
  actions.setNotifications.mockResolvedValue(fail('Los recordatorios van entre las 09:00 y las 16:00.'));
  renderScreen(<AvisosSection {...props} />);
  fireEvent.change(screen.getByLabelText('Recordatorio 1'), { target: { value: '18:00' } });
  expect(await screen.findByText(/entre las 09:00 y las 16:00/)).toBeTruthy();
  await waitFor(() => expect((screen.getByLabelText('Recordatorio 1') as HTMLInputElement).value).toBe('11:00'));
});

test('con Telegram sin configurar el interruptor está apagado y explica cómo activarlo', () => {
  renderScreen(<AvisosSection {...props} telegramConfigured={false} notifyTelegram />);
  const sw = screen.getByRole('switch', { name: 'Telegram' });
  expect(sw.getAttribute('aria-checked')).toBe('false');
  expect((sw as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/docs\/despliegue\.md/)).toBeTruthy();
});

test('dice que no se envía nada fuera de lunes a viernes de 9 a 16, salvo una tarea con hora', () => {
  renderScreen(<AvisosSection {...props} />);
  expect(screen.getByText(/lunes a viernes, de 9:00 a 16:00/)).toBeTruthy();
});

test('el briefing solo ofrece de 9:00 a 11:00 y un valor antiguo de las 8 se enseña como 09:00', () => {
  renderScreen(<DigestSection hour={8} tz="Europe/Madrid" />);
  const select = screen.getByLabelText('Hora del resumen') as HTMLSelectElement;
  expect([...select.options].map((o) => o.value)).toEqual(['9', '10', '11']);
  expect(select.value).toBe('9');
});

test('el resumen semanal ya no ofrece el domingo por la noche', () => {
  renderScreen(<WeeklySection value="domingo" />);
  const select = screen.getByLabelText('Cuándo llega el resumen semanal') as HTMLSelectElement;
  expect([...select.options].map((o) => o.value)).toEqual(['lunes', 'off']);
  expect(select.value).toBe('lunes');
});
