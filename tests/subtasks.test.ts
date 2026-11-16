import { describe, expect, it } from 'vitest';
import { addSubtask, parseSubtasks, removeSubtask, subtaskProgress, toggleSubtask } from '@/lib/subtasks';

const list = [
  { title: 'Comprar pintura', done: true },
  { title: 'Lijar la pared', done: false },
];

describe('parseSubtasks', () => {
  it('lee la lista que viaja en el formulario', () => {
    expect(parseSubtasks(JSON.stringify(list))).toEqual(list);
  });

  it('ignora lo que no es una lista válida (basura, vacío, títulos en blanco)', () => {
    expect(parseSubtasks('')).toEqual([]);
    expect(parseSubtasks('no es json')).toEqual([]);
    expect(parseSubtasks('{"a":1}')).toEqual([]);
    expect(parseSubtasks(JSON.stringify([{ title: '  ', done: false }, { title: 'Vale', done: 'sí' }, { title: 'Bien', done: true }]))).toEqual([{ title: 'Bien', done: true }]);
  });

  it('recorta los títulos', () => {
    expect(parseSubtasks(JSON.stringify([{ title: '  Lijar  ', done: false }]))).toEqual([{ title: 'Lijar', done: false }]);
  });
});

describe('editar la lista', () => {
  it('añade al final, sin vacíos ni repetidos', () => {
    expect(addSubtask(list, ' Barnizar ')).toEqual([...list, { title: 'Barnizar', done: false }]);
    expect(addSubtask(list, '   ')).toBe(list);
    expect(addSubtask(list, 'lijar la pared')).toBe(list);
  });

  it('marca y desmarca una subtarea sin tocar las demás', () => {
    expect(toggleSubtask(list, 1)).toEqual([list[0], { title: 'Lijar la pared', done: true }]);
    expect(toggleSubtask(list, 0)[0].done).toBe(false);
    expect(list[1].done).toBe(false); // no muta
  });

  it('quita una subtarea', () => {
    expect(removeSubtask(list, 0)).toEqual([list[1]]);
    expect(removeSubtask(list, 9)).toEqual(list);
  });
});

describe('subtaskProgress', () => {
  it('«1/2» cuando hay subtareas, null cuando no', () => {
    expect(subtaskProgress({ subtasks: list })).toBe('1/2');
    expect(subtaskProgress({})).toBeNull();
    expect(subtaskProgress({ subtasks: [] })).toBeNull();
    expect(subtaskProgress({ subtasks: 'x' })).toBeNull();
  });
});
