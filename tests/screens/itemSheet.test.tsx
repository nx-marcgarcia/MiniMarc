// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { ok } from '@/lib/actions/result';
import { makeProject, projectsActions } from '../projectsDoubles';
import { comprasActions, followUpActions, itemsActions, makeItem, renderScreen, router } from './setup';

vi.mock('@/app/actions/items', () => import('./setup').then((m) => m.itemsActionsModule));
vi.mock('@/app/actions/photos', () => ({ addPhoto: vi.fn(), deletePhoto: vi.fn() }));
vi.mock('@/lib/supabase/browser', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => import('./setup').then((m) => m.navigationModule));

const item = makeItem({ notes: 'Pedir cita por la tarde', dueAt: '2026-10-25T10:00:00.000Z' });
const screenUi = () => (
  <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [item] }]} />
);

async function openRow(user: ReturnType<typeof renderScreen>['user']) {
  await user.click(screen.getByRole('button', { name: 'Abrir «Llamar al dentista»' }));
  const dialog = await screen.findByRole('dialog', { name: 'Editar' });
  expect(dialog.getAttribute('data-open')).toBe('true');
  return dialog;
}

test('abrir una fila carga sus datos en la hoja', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);

  expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Llamar al dentista');
  expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toBe('Pedir cita por la tarde');
  expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-10-25');
});

test('guardar manda el patch con el título y la fecha editados', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);

  const title = screen.getByLabelText('Título');
  await user.clear(title);
  await user.type(title, 'Llamar al médico');
  const date = screen.getByLabelText('Fecha') as HTMLInputElement;
  await user.clear(date);
  await user.type(date, '2026-11-02');
  await user.click(screen.getByRole('button', { name: 'OK' }));

  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  const [id, patch] = itemsActions.moveItem.mock.calls[0];
  expect(id).toBe('item-1');
  expect(patch).toMatchObject({ title: 'Llamar al médico', type: 'tarea' });
  expect(JSON.stringify(patch.dueAt)).toContain('2026-11-0');
});

test('cerrar sin guardar no llama a ninguna acción', async () => {
  const { user } = renderScreen(screenUi());
  const dialog = await openRow(user);
  await user.type(screen.getByLabelText('Título'), ' (editado)');
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));

  await waitFor(() => expect(dialog.getAttribute('data-open')).toBe('false'));

  expect(itemsActions.addItem).not.toHaveBeenCalled();
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
  expect(itemsActions.toggleDone).not.toHaveBeenCalled();
  expect(itemsActions.deleteItem).not.toHaveBeenCalled();
});

const compra = makeItem({ id: 'c1', type: 'compra', title: 'Reloj Casio', status: 'quiero', area: null, data: { quantity: 1, currency: 'EUR', price: 25 } });
const idea = makeItem({ id: 'i1', type: 'idea', title: 'Blog de viajes', status: 'semilla', area: null, data: {} });
const regalo = makeItem({ id: 'r1', type: 'regalo', title: 'Caja', status: 'idea', area: null, data: { approxPrice: 30 } });

async function open(user: ReturnType<typeof renderScreen>['user'], it: ReturnType<typeof makeItem>, title: string) {
  await user.click(screen.getByRole('button', { name: `Abrir «${it.title}»` }));
  await screen.findByRole('dialog', { name: 'Editar' });
  void title;
}

test('una compra enseña su estado y sus campos propios con los valores que tiene', async () => {
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  expect((screen.getByLabelText('Estado') as HTMLSelectElement).value).toBe('quiero');
  expect(Array.from((screen.getByLabelText('Estado') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['quiero', 'en_carrito', 'comprado', 'descartado']);
  expect((screen.getByLabelText('Precio') as HTMLInputElement).value).toBe('25');
  expect((screen.getByLabelText('Cantidad') as HTMLInputElement).value).toBe('1');
});

test('guardar una compra manda el estado y el precio nuevos', async () => {
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  await user.selectOptions(screen.getByLabelText('Estado'), 'en_carrito');
  const price = screen.getByLabelText('Precio');
  await user.clear(price);
  await user.type(price, '19,90');
  await user.type(screen.getByLabelText('Variante'), 'Azul');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ status: 'en_carrito', data: { quantity: 1, currency: 'EUR', price: 19.9, variant: 'Azul' } });
});

test('una compra sin tienda deja elegirla en la hoja y la manda en el patch', async () => {
  followUpActions.listCaptureChoices.mockResolvedValue(ok({ people: [], stores: [{ id: 's1', name: 'Casio' }, { id: 's2', name: 'Amazon' }] }));
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  const select = (await screen.findByLabelText('Tienda')) as HTMLSelectElement;
  expect(select.value).toBe('');
  await user.selectOptions(select, 's1');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ storeId: 's1' });
});

test('sin tiendas guardadas la hoja de una compra deja crear la primera', async () => {
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  const select = (await screen.findByLabelText('Tienda')) as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.text)).toEqual(['Sin tienda', 'Nueva tienda…']);
});

test('«Nueva tienda…» crea la tienda al guardar y la compra se guarda con ella', async () => {
  followUpActions.listCaptureChoices.mockResolvedValue(ok({ people: [], stores: [{ id: 's1', name: 'Casio' }] }));
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  await user.selectOptions(await screen.findByLabelText('Tienda'), 'Nueva tienda…');
  await user.type(screen.getByLabelText('Nombre'), ' Aliexpress ');
  // Choosing the option creates nothing: a cancelled sheet leaves no store behind.
  expect(followUpActions.createStore).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(followUpActions.createStore).toHaveBeenCalledWith(' Aliexpress '.trim());
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ storeId: 'store-new' });
});

test('«Nueva tienda…» sin nombre se dice en la hoja y no guarda nada', async () => {
  followUpActions.listCaptureChoices.mockResolvedValue(ok({ people: [], stores: [] }));
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  await user.selectOptions(await screen.findByLabelText('Tienda'), 'Nueva tienda…');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(await screen.findByText('Escribe el nombre de la tienda.')).toBeTruthy();
  expect(followUpActions.createStore).not.toHaveBeenCalled();
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
});

test('si crear la tienda falla, la compra no se guarda y la hoja lo dice', async () => {
  followUpActions.listCaptureChoices.mockResolvedValue(ok({ people: [], stores: [] }));
  followUpActions.createStore.mockResolvedValue({ ok: false, error: 'No se ha podido crear la tienda.' });
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  await user.selectOptions(await screen.findByLabelText('Tienda'), 'Nueva tienda…');
  await user.type(screen.getByLabelText('Nombre'), 'Casio');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(await screen.findByText('No se ha podido crear la tienda.')).toBeTruthy();
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
});

test('un precio inválido se dice en la hoja y no se guarda', async () => {
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [compra] }]} />);
  await open(user, compra, 'Compras');
  const price = screen.getByLabelText('Precio');
  await user.clear(price);
  await user.type(price, 'abc');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(await screen.findByText('El precio no es válido.')).toBeTruthy();
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
});

test('una idea tiene estado (sin check de completar), categoría, potencial y siguiente paso', async () => {
  const { user } = renderScreen(<ItemsScreen title="Ideas" today="2026-10-22" sections={[{ key: 'a', items: [idea] }]} />);
  await open(user, idea, 'Ideas');
  expect(Array.from((screen.getByLabelText('Estado') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['semilla', 'explorando', 'en_marcha', 'descartada']);
  await user.type(screen.getByLabelText('Categoría'), 'viaje');
  await user.selectOptions(screen.getByLabelText('Potencial'), '4');
  await user.type(screen.getByLabelText('Siguiente paso'), 'Elegir plataforma');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ data: { category: 'viaje', potential: 4, nextStep: 'Elegir plataforma' } });
});

test('un regalo tiene su estado, precio aproximado y ocasión', async () => {
  const { user } = renderScreen(<ItemsScreen title="Regalos" today="2026-10-22" sections={[{ key: 'a', items: [regalo] }]} />);
  await open(user, regalo, 'Regalos');
  expect((screen.getByLabelText('Precio aproximado') as HTMLInputElement).value).toBe('30');
  await user.selectOptions(screen.getByLabelText('Estado'), 'comprado');
  await user.type(screen.getByLabelText('Ocasión'), 'Navidad');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ status: 'comprado', data: { approxPrice: 30, occasion: 'Navidad' } });
});

test('una tarea enseña su estado (con En espera) y no los campos de una compra', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);
  expect(Array.from((screen.getByLabelText('Estado') as HTMLSelectElement).options).map((o) => o.value)).toEqual(['pendiente', 'en_espera', 'hecha']);
  expect(screen.queryByLabelText('Precio')).toBeNull();
  expect(screen.queryByLabelText('Esperando a')).toBeNull();
});

test('el formulario manual de una compra nueva pide también sus campos propios', async () => {
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[]} newItem={{ type: 'compra', label: 'Nueva compra' }} />);
  await user.click(screen.getByRole('button', { name: 'Nueva compra' }));
  await screen.findByRole('dialog', { name: 'Nueva compra' });
  await user.type(screen.getByLabelText('Título'), 'Pilas AAA');
  await user.type(screen.getByLabelText('Precio'), '3,5');
  await user.click(screen.getByRole('button', { name: 'Añadir' }));
  await waitFor(() => expect(itemsActions.addItem).toHaveBeenCalledTimes(1));
  const fd = itemsActions.addItem.mock.calls[0][0] as FormData;
  expect(fd.get('price')).toBe('3,5');
  expect(fd.get('type')).toBe('compra');
});

test('una tarea se puede repetir desde su hoja', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);
  await user.selectOptions(screen.getByLabelText('Repetir'), 'semanal');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ data: { recurrence: 'semanal' } });
});

test('repetir sin fecha avisa y no guarda', async () => {
  const { user } = renderScreen(
    <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [makeItem({ dueAt: null })] }]} />,
  );
  await openRow(user);
  await user.selectOptions(screen.getByLabelText('Repetir'), 'diaria');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/necesita fecha/);
  expect(itemsActions.moveItem).not.toHaveBeenCalled();
});

test('una compra no enseña «Repetir»', async () => {
  const { user } = renderScreen(<ItemsScreen title="Compras" today="2026-10-22" sections={[]} newItem={{ type: 'compra', label: 'Nueva compra' }} />);
  await user.click(screen.getByRole('button', { name: 'Nueva compra' }));
  await screen.findByRole('dialog', { name: 'Nueva compra' });
  expect(screen.queryByLabelText('Repetir')).toBeNull();
});

const withSubtasks = makeItem({
  id: 's1',
  title: 'Pintar el salón',
  dueAt: null,
  data: { subtasks: [{ title: 'Comprar pintura', done: true }, { title: 'Lijar la pared', done: false }] },
});
const subtasksUi = () => <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [withSubtasks] }]} />;
const openSubtasksRow = async (user: ReturnType<typeof renderScreen>['user']) => {
  await user.click(screen.getByRole('button', { name: 'Abrir «Pintar el salón»' }));
  await screen.findByRole('dialog', { name: 'Editar' });
};

test('la hoja de una tarea lista sus subtareas, marcadas o no', async () => {
  const { user } = renderScreen(subtasksUi());
  await openSubtasksRow(user);
  expect((screen.getByRole('checkbox', { name: 'Comprar pintura' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Lijar la pared' }) as HTMLInputElement).checked).toBe(false);
});

test('marcar, añadir y quitar subtareas se guarda con la tarea', async () => {
  const { user } = renderScreen(subtasksUi());
  await openSubtasksRow(user);
  await user.click(screen.getByRole('checkbox', { name: 'Lijar la pared' }));
  await user.type(screen.getByLabelText('Nueva subtarea'), 'Barnizar{Enter}');
  await user.click(screen.getByRole('button', { name: 'Quitar «Comprar pintura»' }));
  expect(itemsActions.moveItem).not.toHaveBeenCalled(); // Enter added the subtask, it did not submit the sheet
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({
    data: { subtasks: [{ title: 'Lijar la pared', done: true }, { title: 'Barnizar', done: false }] },
  });
});

test('quitar todas las subtareas las borra de la tarea', async () => {
  const { user } = renderScreen(subtasksUi());
  await openSubtasksRow(user);
  await user.click(screen.getByRole('button', { name: 'Quitar «Comprar pintura»' }));
  await user.click(screen.getByRole('button', { name: 'Quitar «Lijar la pared»' }));
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1].data).toEqual({});
});

test('la fila de una tarea con subtareas dice cuántas lleva hechas', () => {
  renderScreen(subtasksUi());
  expect(screen.getByText(/1\/2 subtareas/)).toBeTruthy();
});

test('con proyectos, la hoja deja elegir uno y guardar lo manda en el patch', async () => {
  projectsActions.listProjectOptions.mockResolvedValue(ok({ available: true, projects: [makeProject()] }));
  const { user } = renderScreen(screenUi());
  await openRow(user);
  await user.selectOptions(await screen.findByLabelText('Proyecto'), 'Viaje a Japón');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).toMatchObject({ projectId: 'p1' });
});

test('sin proyectos no hay selector, y guardar no toca el proyecto', async () => {
  const { user } = renderScreen(screenUi());
  await openRow(user);
  await waitFor(() => expect(projectsActions.listProjectOptions).toHaveBeenCalled());
  expect(screen.queryByLabelText('Proyecto')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).not.toHaveProperty('projectId');
});

test('una idea se convierte en proyecto y se abre su ficha', async () => {
  const idea = makeItem({ id: 'i1', type: 'idea', title: 'Huerto urbano', status: 'semilla' });
  const { user } = renderScreen(<ItemsScreen title="Ideas" today="2026-10-22" sections={[{ key: 'a', items: [idea] }]} />);
  await user.click(screen.getByRole('button', { name: 'Abrir «Huerto urbano»' }));
  await user.click(await screen.findByRole('button', { name: 'Convertir en proyecto' }));
  await waitFor(() => expect(projectsActions.ideaToProject).toHaveBeenCalledWith('i1'));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/proyectos/p1'));
});

test('sin la migración 0014, una idea no ofrece convertirse en proyecto', async () => {
  projectsActions.listProjectOptions.mockResolvedValue(ok({ available: false, projects: [] }));
  const idea = makeItem({ id: 'i1', type: 'idea', title: 'Huerto urbano', status: 'semilla' });
  const { user } = renderScreen(<ItemsScreen title="Ideas" today="2026-10-22" sections={[{ key: 'a', items: [idea] }]} />);
  await user.click(screen.getByRole('button', { name: 'Abrir «Huerto urbano»' }));
  await waitFor(() => expect(projectsActions.listProjectOptions).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Convertir en proyecto' })).toBeNull();
});

test('editar un elemento de un proyecto terminado no lo saca del proyecto', async () => {
  projectsActions.listProjectOptions.mockResolvedValue(
    ok({ available: true, projects: [makeProject({ id: 'done', name: 'Reforma baño', status: 'terminado' }), makeProject()] }),
  );
  const inDone = makeItem({ projectId: 'done' });
  const { user } = renderScreen(<ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [inDone] }]} />);
  await openRow(user);
  const select = (await screen.findByLabelText('Proyecto')) as HTMLSelectElement;
  expect(select.value).toBe('done');
  expect([...select.options].map((o) => o.text)).toEqual(['Ninguno', 'Reforma baño', 'Viaje a Japón']);
  await user.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
  expect(itemsActions.moveItem.mock.calls[0][1]).not.toHaveProperty('projectId');
});

test('un proyecto terminado no se ofrece a lo que no está en él', async () => {
  projectsActions.listProjectOptions.mockResolvedValue(
    ok({ available: true, projects: [makeProject({ id: 'done', name: 'Reforma baño', status: 'terminado' }), makeProject()] }),
  );
  const { user } = renderScreen(screenUi());
  await openRow(user);
  const select = (await screen.findByLabelText('Proyecto')) as HTMLSelectElement;
  expect([...select.options].map((o) => o.text)).toEqual(['Ninguno', 'Viaje a Japón']);
});

describe('En espera', () => {
  const t = makeItem({ title: 'Escribir a Funko', status: 'pendiente', data: {} });
  const ui = (item = t) => <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [item] }]} />;

  test('al elegir En espera aparecen «Esperando a» y «Volver a mirar el», y se guardan con el estado', async () => {
    const { user } = renderScreen(ui());
    await user.click(screen.getByRole('button', { name: 'Abrir «Escribir a Funko»' }));
    await screen.findByRole('dialog', { name: 'Editar' });
    expect(screen.queryByLabelText('Esperando a')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Estado'), 'en_espera');
    await user.type(screen.getByLabelText('Esperando a'), 'Funko');
    await user.type(screen.getByLabelText('Volver a mirar el'), '2026-10-29');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
    const patch = itemsActions.moveItem.mock.calls[0][1];
    expect(patch.status).toBe('en_espera');
    expect(patch.data).toMatchObject({ waitingFor: 'Funko', reviewOn: '2026-10-29' });
  });

  test('la fila de una tarea en espera dice a quién espera, desde cuándo y cuándo mirarla', () => {
    const waiting = makeItem({ title: 'Escribir a Funko', status: 'en_espera', data: { waitingFor: 'Funko', waitingSince: '2026-10-20', reviewOn: '2026-10-29' } });
    renderScreen(ui(waiting));
    expect(screen.getByText(/Esperando a Funko · desde 20 de octubre · mirar 29 de octubre/)).toBeTruthy();
  });
});

describe('Fecha límite', () => {
  const withDeadline = makeItem({ title: 'Entregar informe', dueAt: '2026-10-25T10:00:00.000Z', data: { deadline: '2026-10-30' } });
  const ui = (item = withDeadline) => <ItemsScreen title="Tareas" today="2026-10-22" sections={[{ key: 'a', items: [item] }]} />;

  test('la fila dice el límite y la hoja lo trae relleno', async () => {
    const { user } = renderScreen(ui());
    expect(screen.getByText(/Límite: 30 de octubre/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Abrir «Entregar informe»' }));
    await screen.findByRole('dialog', { name: 'Editar' });
    expect((screen.getByLabelText('Fecha límite') as HTMLInputElement).value).toBe('2026-10-30');
  });

  test('cambiar la fecha prevista no toca el límite, y cambiar el límite lo manda en data', async () => {
    const { user } = renderScreen(ui());
    await user.click(screen.getByRole('button', { name: 'Abrir «Entregar informe»' }));
    await screen.findByRole('dialog', { name: 'Editar' });
    const date = screen.getByLabelText('Fecha') as HTMLInputElement;
    await user.clear(date);
    await user.type(date, '2026-10-27');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
    expect(itemsActions.moveItem.mock.calls[0][1].data).toBeUndefined();

    itemsActions.moveItem.mockClear();
    await user.click(screen.getByRole('button', { name: 'Abrir «Entregar informe»' }));
    const deadline = (await screen.findByLabelText('Fecha límite')) as HTMLInputElement;
    await user.clear(deadline);
    await user.type(deadline, '2026-11-05');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(itemsActions.moveItem).toHaveBeenCalledTimes(1));
    expect(itemsActions.moveItem.mock.calls[0][1].data).toEqual({ deadline: '2026-11-05' });
  });

  test('un límite anterior a la fecha prevista se dice en la hoja y no se guarda', async () => {
    const { user } = renderScreen(ui());
    await user.click(screen.getByRole('button', { name: 'Abrir «Entregar informe»' }));
    const deadline = (await screen.findByLabelText('Fecha límite')) as HTMLInputElement;
    await user.clear(deadline);
    await user.type(deadline, '2026-10-20');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('La fecha límite no puede ser anterior a la fecha prevista.')).toBeTruthy();
    expect(itemsActions.moveItem).not.toHaveBeenCalled();
  });
});

describe('Separar en productos', () => {
  const aliexpress = makeItem({ id: 'a1', type: 'compra', title: 'Aliexpress', notes: 'funda, cable y soporte', status: 'quiero', area: null, data: {} });
  const proposal = {
    store: { name: 'Aliexpress', domain: 'aliexpress.com' },
    products: [
      { title: 'Funda móvil', price: null, link: null, notes: null },
      { title: 'Cable USB-C', price: 4.5, link: null, notes: null },
      { title: 'Soporte', price: null, link: null, notes: null },
    ],
  };
  const ui = (item = aliexpress) => <ItemsScreen title="Compras" today="2026-10-22" sections={[{ key: 'a', items: [item] }]} />;

  async function startSplit(user: ReturnType<typeof renderScreen>['user'], item = aliexpress) {
    await open(user, item, 'Compras');
    await user.click(screen.getByRole('button', { name: 'Separar en productos' }));
  }

  test('enseña lo que la IA ha visto, editable, sin guardar nada hasta confirmar', async () => {
    comprasActions.suggestCompraSplit.mockResolvedValue(ok(proposal));
    const { user } = renderScreen(ui());
    await startSplit(user);
    expect(await screen.findByDisplayValue('Funda móvil')).toBeTruthy();
    expect((screen.getByLabelText('Precio del producto 2') as HTMLInputElement).value).toBe('4,5');
    expect((screen.getByLabelText('Tienda') as HTMLInputElement).value).toBe('Aliexpress');
    expect(screen.getByRole('button', { name: 'Separar en 3 compras' })).toBeTruthy();
    expect(comprasActions.suggestCompraSplit).toHaveBeenCalledWith('a1');
    expect(comprasActions.splitCompraItem).not.toHaveBeenCalled();
  });

  test('confirmar manda los productos que quedan, con la tienda y los precios editados', async () => {
    comprasActions.suggestCompraSplit.mockResolvedValue(ok(proposal));
    const { user } = renderScreen(ui());
    await startSplit(user);
    await screen.findByDisplayValue('Soporte');
    await user.click(screen.getByLabelText('Quitar el producto 3'));
    const price = screen.getByLabelText('Precio del producto 1');
    await user.type(price, '12,90');
    const store = screen.getByLabelText('Tienda');
    await user.clear(store);
    await user.type(store, 'Amazon');
    await user.click(screen.getByRole('button', { name: 'Separar en 2 compras' }));
    await waitFor(() => expect(comprasActions.splitCompraItem).toHaveBeenCalledTimes(1));
    expect(comprasActions.splitCompraItem).toHaveBeenCalledWith('a1', {
      store: { name: 'Amazon', domain: 'aliexpress.com' },
      products: [
        { title: 'Funda móvil', price: 12.9, link: null, notes: null },
        { title: 'Cable USB-C', price: 4.5, link: null, notes: null },
      ],
    });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  test('con menos de dos productos no se puede confirmar', async () => {
    comprasActions.suggestCompraSplit.mockResolvedValue(ok(proposal));
    const { user } = renderScreen(ui());
    await startSplit(user);
    await screen.findByDisplayValue('Soporte');
    await user.click(screen.getByLabelText('Quitar el producto 3'));
    await user.click(screen.getByLabelText('Quitar el producto 2'));
    expect((screen.getByRole('button', { name: 'Hacen falta al menos dos productos' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('un precio inválido se dice y no se manda', async () => {
    comprasActions.suggestCompraSplit.mockResolvedValue(ok(proposal));
    const { user } = renderScreen(ui());
    await startSplit(user);
    await user.type(await screen.findByLabelText('Precio del producto 1'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Separar en 3 compras' }));
    expect(await screen.findByText('El precio de «Funda móvil» no es válido.')).toBeTruthy();
    expect(comprasActions.splitCompraItem).not.toHaveBeenCalled();
  });

  test('si la IA no ve varios productos, lo dice; si falla el guardado, la hoja se queda con lo escrito', async () => {
    comprasActions.suggestCompraSplit.mockResolvedValue(ok({ store: null, products: [proposal.products[0]] }));
    const first = renderScreen(ui());
    await startSplit(first.user);
    expect(await screen.findByText(/No veo varios productos/)).toBeTruthy();
    first.unmount();

    comprasActions.suggestCompraSplit.mockResolvedValue(ok(proposal));
    comprasActions.splitCompraItem.mockResolvedValue({ ok: false, error: 'No se ha podido separar. No se ha cambiado nada.' });
    const second = renderScreen(ui());
    await startSplit(second.user);
    await screen.findByDisplayValue('Soporte');
    await second.user.click(screen.getByRole('button', { name: 'Separar en 3 compras' }));
    expect(await screen.findByText('No se ha podido separar. No se ha cambiado nada.')).toBeTruthy();
    expect(screen.getByDisplayValue('Soporte')).toBeTruthy();
  });

  test('«Atrás» vuelve a la hoja de la compra', async () => {
    comprasActions.suggestCompraSplit.mockResolvedValue(ok(proposal));
    const { user } = renderScreen(ui());
    await startSplit(user);
    await screen.findByDisplayValue('Soporte');
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByLabelText('Título')).toBeTruthy();
  });

  test('una compra de Trabajo no ofrece separar (no va a la IA)', async () => {
    const { user } = renderScreen(ui({ ...aliexpress, area: 'trabajo' }));
    await open(user, aliexpress, 'Compras');
    expect(screen.queryByRole('button', { name: 'Separar en productos' })).toBeNull();
  });

  test('una tarea no ofrece separar', async () => {
    const { user } = renderScreen(screenUi());
    await openRow(user);
    expect(screen.queryByRole('button', { name: 'Separar en productos' })).toBeNull();
  });
});
