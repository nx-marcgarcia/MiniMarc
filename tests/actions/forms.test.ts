import { describe, expect, it } from 'vitest';
import { makeItem } from '../screens/setup';
import {
  dataFromForm,
  editPatchFromForm,
  newItemFormError,
  parseSizes,
  personFormError,
  personProfileFromForm,
  sizesToText,
} from '@/lib/actions/forms';

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe('newItemFormError', () => {
  it('pide un título si está vacío', () => {
    expect(newItemFormError(form({ title: '   ' }))).toBe('Escribe un título.');
    expect(newItemFormError(form({ title: 'Leche' }))).toBeNull();
  });
});

describe('personFormError', () => {
  it('pide un nombre si está vacío', () => {
    expect(personFormError(form({ name: '' }))).toBe('Escribe un nombre.');
    expect(personFormError(form({ name: 'Ana' }))).toBeNull();
  });
});

describe('personFormError: ficha ampliada', () => {
  it('rechaza un correo que no lo es y una relación desconocida', () => {
    expect(personFormError(form({ name: 'Ana', email: 'no-es-correo' }))).toBe('El correo no es válido.');
    expect(personFormError(form({ name: 'Ana', relation: 'vecino' }))).toBe('La relación no es válida.');
  });

  it('acepta correo y relación válidos, o vacíos', () => {
    expect(personFormError(form({ name: 'Ana', email: 'ana@example.com', relation: 'amigo' }))).toBeNull();
    expect(personFormError(form({ name: 'Ana', email: '', relation: '' }))).toBeNull();
  });
});

describe('personProfileFromForm', () => {
  it('lee alias, relación, gustos, tallas y contacto', () => {
    const patch = personProfileFromForm(
      form({
        alias: ' papá , padre,, ',
        relation: 'familia',
        likes: ' Relojes ',
        dislikes: 'Perfume',
        sizes: 'camiseta: M\nzapatos: 42',
        email: ' rosendo@example.com ',
        phone: '600 000 000',
      }),
    );
    expect(patch).toEqual({
      alias: ['papá', 'padre'],
      relation: 'familia',
      likes: 'Relojes',
      dislikes: 'Perfume',
      sizes: { camiseta: 'M', zapatos: '42' },
      contact: { email: 'rosendo@example.com', phone: '600 000 000' },
    });
  });

  it('un campo vacío lo borra', () => {
    expect(personProfileFromForm(form({ alias: '', relation: '', likes: '', dislikes: '', sizes: '', email: '', phone: '' }))).toEqual({
      alias: [],
      relation: null,
      likes: null,
      dislikes: null,
      sizes: {},
      contact: {},
    });
  });

  it('un campo que el formulario no trae no se toca', () => {
    expect(personProfileFromForm(form({ name: 'Ana' }))).toEqual({});
    expect(personProfileFromForm(form({ likes: 'té' }))).toEqual({ likes: 'té' });
  });
});

describe('tallas como texto', () => {
  it('parseSizes lee "clave: valor" por líneas y se salta lo que no lo es', () => {
    expect(parseSizes('camiseta: M\n\nsin dos puntos\n zapatos : 42 \nurl: https://x.es')).toEqual({
      camiseta: 'M',
      zapatos: '42',
      url: 'https://x.es',
    });
  });

  it('sizesToText es la inversa', () => {
    expect(sizesToText({ camiseta: 'M', zapatos: '42' })).toBe('camiseta: M\nzapatos: 42');
    expect(parseSizes(sizesToText({ a: '1', b: '2' }))).toEqual({ a: '1', b: '2' });
    expect(sizesToText({})).toBe('');
  });
});

describe('editPatchFromForm', () => {
  it('tarea: título, notas, área y fecha de Madrid', () => {
    const r = editPatchFromForm(form({ title: ' Dentista ', notes: '', dueDate: '2026-10-22', dueTime: '09:30' }), {
      type: 'tarea',
      area: 'trabajo',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        title: 'Dentista',
        notes: null,
        type: 'tarea',
        area: 'trabajo',
        dueAt: '2026-10-22T07:30:00.000Z',
        hasTime: true,
        personId: null,
      },
    });
  });

  it('fecha inválida → error en español, sin patch', () => {
    expect(editPatchFromForm(form({ title: 'X', dueDate: '2026-02-30' }), { type: 'tarea', area: 'personal' })).toEqual({
      ok: false,
      error: 'La fecha no es válida.',
    });
  });

  it('una tarea que se repite necesita fecha', () => {
    expect(editPatchFromForm(form({ title: 'Regar', recurrence: 'semanal' }), { type: 'tarea', area: 'personal' })).toEqual({
      ok: false,
      error: 'Para repetirla, la tarea necesita fecha.',
    });
    const r = editPatchFromForm(form({ title: 'Regar', recurrence: 'semanal', dueDate: '2026-10-22' }), {
      type: 'tarea',
      area: 'personal',
      item: makeItem({ type: 'tarea', data: {} }),
    });
    expect(r).toMatchObject({ ok: true, value: { data: { recurrence: 'semanal' } } });
  });

  it('título vacío → error', () => {
    expect(editPatchFromForm(form({ title: ' ' }), { type: 'idea', area: 'personal' })).toEqual({
      ok: false,
      error: 'Escribe un título.',
    });
  });

  it('regalo: guarda la persona; Sin clasificar: archiva la revisión', () => {
    const r = editPatchFromForm(form({ title: 'Libro', personId: 'p1' }), { type: 'regalo', area: 'personal', reviewMode: true });
    expect(r).toEqual({
      ok: true,
      value: { title: 'Libro', notes: null, type: 'regalo', personId: 'p1', needsReview: false },
    });
  });
});

describe('dataFromForm: los campos propios de cada tipo', () => {
  const base = { quantity: 1, currency: 'EUR' };

  it('compra: cantidad, precio (con coma), variante y urgencia', () => {
    const r = dataFromForm('compra', form({ quantity: '2', price: '12,50', variant: ' talla M ', urgency: 'alta' }), base);
    expect(r).toEqual({ ok: true, value: { quantity: 2, currency: 'EUR', price: 12.5, variant: 'talla M', urgency: 'alta' } });
  });

  it('un campo vacío lo quita; uno que el formulario no trae no se toca', () => {
    expect(dataFromForm('compra', form({ price: '' }), { ...base, price: 20, variant: 'azul' })).toEqual({
      ok: true,
      value: { quantity: 1, currency: 'EUR', variant: 'azul' },
    });
  });

  it('precio y cantidad inválidos dan su mensaje', () => {
    expect(dataFromForm('compra', form({ price: 'abc' }), base)).toEqual({ ok: false, error: 'El precio no es válido.' });
    expect(dataFromForm('compra', form({ price: '-3' }), base)).toEqual({ ok: false, error: 'El precio no es válido.' });
    expect(dataFromForm('compra', form({ quantity: '0' }), base)).toEqual({ ok: false, error: 'La cantidad no es válida.' });
    expect(dataFromForm('compra', form({ quantity: '1,5' }), base)).toEqual({ ok: false, error: 'La cantidad no es válida.' });
  });

  it('regalo: precio aproximado y ocasión', () => {
    expect(dataFromForm('regalo', form({ approxPrice: '30', occasion: ' Cumpleaños ' }), {})).toEqual({ ok: true, value: { approxPrice: 30, occasion: 'Cumpleaños' } });
    expect(dataFromForm('regalo', form({ approxPrice: 'x' }), {})).toEqual({ ok: false, error: 'El precio no es válido.' });
  });

  it('tarea: la repetición se guarda en sus campos y se puede quitar', () => {
    expect(dataFromForm('tarea', form({ recurrence: 'semanal' }), {})).toEqual({ ok: true, value: { recurrence: 'semanal' } });
    expect(dataFromForm('tarea', form({ recurrence: '' }), { recurrence: 'diaria', context: 'casa' })).toEqual({ ok: true, value: { context: 'casa' } });
    expect(dataFromForm('tarea', form({ recurrence: 'cada_lustro' }), {})).toEqual({ ok: false, error: 'La repetición no es válida.' });
  });

  it('tarea: las subtareas viajan como JSON y una lista vacía las quita', () => {
    const list = [{ title: 'Lijar', done: false }, { title: 'Pintar', done: true }];
    expect(dataFromForm('tarea', form({ subtasks: JSON.stringify(list) }), {})).toEqual({ ok: true, value: { subtasks: list } });
    expect(dataFromForm('tarea', form({ subtasks: '[]' }), { subtasks: list, recurrence: 'diaria' })).toEqual({ ok: true, value: { recurrence: 'diaria' } });
    expect(dataFromForm('tarea', form({ title: 'x' }), { subtasks: list })).toEqual({ ok: true, value: { subtasks: list } });
  });

  it('libro: valoración de 1 a 5 y páginas; no pierde la portada que ya tenía', () => {
    const base = { cover: 'https://covers.openlibrary.org/b/id/7-M.jpg' };
    expect(dataFromForm('libro', form({ rating: '4', pages: '320' }), base)).toEqual({ ok: true, value: { ...base, rating: 4, pages: 320 } });
    expect(dataFromForm('libro', form({ rating: '' }), { ...base, rating: 3 })).toEqual({ ok: true, value: base });
    expect(dataFromForm('libro', form({ rating: '6' }), {})).toEqual({ ok: false, error: 'La valoración va de 1 a 5.' });
    expect(dataFromForm('libro', form({ pages: '0' }), {})).toEqual({ ok: false, error: 'Las páginas no son válidas.' });
  });

  it('idea: categoría, potencial de 1 a 5 y siguiente paso', () => {
    expect(dataFromForm('idea', form({ category: 'app', potential: '4', nextStep: 'Hacer un prototipo' }), {})).toEqual({
      ok: true,
      value: { category: 'app', potential: 4, nextStep: 'Hacer un prototipo' },
    });
    expect(dataFromForm('idea', form({ potential: '6' }), {})).toEqual({ ok: false, error: 'El potencial va de 1 a 5.' });
  });

  it('los demás tipos devuelven lo que había', () => {
    expect(dataFromForm('tarea', form({ price: '5' }), { context: 'casa' })).toEqual({ ok: true, value: { context: 'casa' } });
    expect(dataFromForm('nota', form({}), {})).toEqual({ ok: true, value: {} });
  });
});

describe('editPatchFromForm: estado y campos propios', () => {
  const compra = makeItem({ id: 'c', type: 'compra', title: 'Reloj', status: 'quiero', area: null, data: { quantity: 1, currency: 'EUR' } });

  it('con el tipo sin cambiar, lleva el estado y los campos propios', () => {
    const r = editPatchFromForm(form({ title: 'Reloj', status: 'en_carrito', price: '25' }), { type: 'compra', area: 'personal', item: compra });
    expect(r.ok && r.value).toMatchObject({ status: 'en_carrito', data: { quantity: 1, currency: 'EUR', price: 25 } });
  });

  it('no manda el estado si no ha cambiado', () => {
    const r = editPatchFromForm(form({ title: 'Reloj', status: 'quiero' }), { type: 'compra', area: 'personal', item: compra });
    expect(r.ok && r.value).not.toHaveProperty('status');
  });

  it('al cambiar de tipo no manda estado ni campos del tipo antiguo (el repositorio reinicia los suyos)', () => {
    const r = editPatchFromForm(form({ title: 'Reloj', status: 'en_carrito', price: '25' }), { type: 'regalo', area: 'personal', item: compra });
    expect(r.ok && r.value).not.toHaveProperty('status');
    expect(r.ok && r.value).not.toHaveProperty('data');
  });

  it('un precio inválido es un error del formulario', () => {
    expect(editPatchFromForm(form({ title: 'Reloj', price: 'abc' }), { type: 'compra', area: 'personal', item: compra })).toEqual({ ok: false, error: 'El precio no es válido.' });
  });

  it('sin item (llamadas antiguas) se comporta como antes', () => {
    const r = editPatchFromForm(form({ title: 'X' }), { type: 'idea', area: 'personal' });
    expect(r.ok && r.value).toMatchObject({ title: 'X', type: 'idea' });
    expect(r.ok && r.value).not.toHaveProperty('data');
  });
});
