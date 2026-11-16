import { describe, expect, it } from 'vitest';
import { matchActions, PALETTE_ACTIONS } from '@/lib/palette';

describe('matchActions', () => {
  it('sin texto, todas', () => {
    expect(matchActions('')).toEqual(PALETTE_ACTIONS);
  });

  it('las que empiezan por la consulta van primero', () => {
    expect(matchActions('revis')[0].label).toBe('Revisión semanal');
  });

  it('busca en etiqueta y palabras clave, sin acentos', () => {
    const labels = matchActions('bandeja').map((a) => a.label);
    expect(labels).toContain('Procesar Bandeja');
    expect(labels).toContain('Ir a Bandeja');
    expect(matchActions('calendario').map((a) => a.label)).toContain('Ir a Calendario');
    expect(matchActions('revision').map((a) => a.label)).toContain('Revisión semanal');
  });

  it('cada acción navega o ejecuta algo', () => {
    for (const a of PALETTE_ACTIONS) expect(Boolean(a.href) !== Boolean(a.run)).toBe(true);
  });

  it('nada que encaje: lista vacía', () => {
    expect(matchActions('zzzz')).toEqual([]);
  });
});
