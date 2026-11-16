import { describe, expect, it } from 'vitest';
import { acceptPatch, processKey, suggestionText, undoAcceptPatch } from '@/lib/bandeja';
import { makeItem } from './screens/setup';

const doubtful = (over: Record<string, unknown> = {}) =>
  makeItem({ type: 'idea', title: 'Trabajar', needsReview: true, suggestion: { type: 'tarea', confidence: 0.3 }, ...over });

describe('acceptPatch', () => {
  it('aceptar usa el tipo sugerido y saca el item de la Bandeja', () => {
    expect(acceptPatch(doubtful())).toEqual({ type: 'tarea', needsReview: false, suggestion: null });
  });

  it('sin sugerencia, acepta el tipo que ya tiene', () => {
    expect(acceptPatch(doubtful({ suggestion: null }))).toEqual({ type: 'idea', needsReview: false, suggestion: null });
  });

  it('con un tipo elegido a mano, usa ese', () => {
    expect(acceptPatch(doubtful(), 'compra')).toEqual({ type: 'compra', needsReview: false, suggestion: null });
  });

  it('deshacer lo devuelve a la Bandeja tal como estaba', () => {
    expect(undoAcceptPatch(doubtful())).toEqual({ type: 'idea', needsReview: true, suggestion: { type: 'tarea', confidence: 0.3 } });
  });
});

describe('suggestionText', () => {
  it('"¿Tarea?" cuando hay sugerencia, y nada cuando no', () => {
    expect(suggestionText(doubtful())).toBe('¿Tarea?');
    expect(suggestionText(doubtful({ suggestion: { type: 'enlace', confidence: 0.4 } }))).toBe('¿Enlace?');
    expect(suggestionText(doubtful({ suggestion: null }))).toBeNull();
  });
});

describe('processKey: los atajos del modo procesar', () => {
  const k = (key: string, mods: Record<string, boolean> = {}) => processKey({ key, altKey: false, ctrlKey: false, metaKey: false, ...mods });

  it('Enter y A aceptan', () => {
    expect(k('Enter')).toEqual({ kind: 'accept' });
    expect(k('a')).toEqual({ kind: 'accept' });
  });

  it('D, Supr y Retroceso descartan', () => {
    expect(k('d')).toEqual({ kind: 'discard' });
    expect(k('Delete')).toEqual({ kind: 'discard' });
    expect(k('Backspace')).toEqual({ kind: 'discard' });
  });

  it('S y la flecha derecha saltan; la izquierda vuelve', () => {
    expect(k('s')).toEqual({ kind: 'skip' });
    expect(k('ArrowRight')).toEqual({ kind: 'skip' });
    expect(k('ArrowLeft')).toEqual({ kind: 'back' });
  });

  it('Escape sale', () => {
    expect(k('Escape')).toEqual({ kind: 'exit' });
  });

  it('los números 1 a 7 eligen el tipo, en el orden del registro', () => {
    expect(k('1')).toEqual({ kind: 'type', type: 'tarea' });
    expect(k('2')).toEqual({ kind: 'type', type: 'idea' });
    expect(k('3')).toEqual({ kind: 'type', type: 'compra' });
    expect(k('4')).toEqual({ kind: 'type', type: 'regalo' });
    expect(k('5')).toEqual({ kind: 'type', type: 'libro' });
    expect(k('6')).toEqual({ kind: 'type', type: 'enlace' });
    expect(k('7')).toEqual({ kind: 'type', type: 'nota' });
    expect(k('8')).toBeNull();
    expect(k('0')).toBeNull();
  });

  it('con Ctrl, Cmd o Alt no hace nada (no pisa los atajos del navegador)', () => {
    expect(k('a', { metaKey: true })).toBeNull();
    expect(k('d', { ctrlKey: true })).toBeNull();
    expect(k('1', { altKey: true })).toBeNull();
  });

  it('cualquier otra tecla no hace nada', () => {
    expect(k('x')).toBeNull();
    expect(k('Tab')).toBeNull();
  });
});
