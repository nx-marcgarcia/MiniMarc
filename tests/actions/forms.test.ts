import { describe, expect, it } from 'vitest';
import {
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
