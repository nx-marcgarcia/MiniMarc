import { describe, expect, it } from 'vitest';
import { linkHref, nextReadingState } from '@/lib/libros';

describe('libros helpers', () => {
  it('nextReadingState: por leer → leyendo → leído → por leer', () => {
    expect(nextReadingState('por_leer')).toBe('leyendo');
    expect(nextReadingState('leyendo')).toBe('leido');
    expect(nextReadingState('leido')).toBe('por_leer');
    expect(nextReadingState(null)).toBe('leyendo');
  });

  it('linkHref acepta http(s), añade https:// a un dominio y rechaza otros esquemas', () => {
    expect(linkHref('https://example.com/a')).toBe('https://example.com/a');
    expect(linkHref(' www.casadellibro.com/x ')).toBe('https://www.casadellibro.com/x');
    expect(linkHref('javascript:alert(1)')).toBeNull();
    expect(linkHref('data:text/html,hola')).toBeNull();
    expect(linkHref('')).toBeNull();
    expect(linkHref(null)).toBeNull();
  });
});
