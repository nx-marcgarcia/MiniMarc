import { describe, expect, it } from 'vitest';
import { matchesArea, parseAreaFilter } from '@/lib/area';

describe('parseAreaFilter', () => {
  it.each([
    [undefined, undefined, 'todo'],
    [undefined, 'trabajo', 'trabajo'],
    ['personal', 'trabajo', 'personal'],
    [undefined, 'xx', 'todo'],
    ['xx', 'personal', 'personal'],
    [['trabajo', 'personal'], undefined, 'trabajo'],
    [undefined, 'todo', 'todo'],
  ] as const)('?area=%s, cookie %s → %s', (param, cookie, expected) => {
    expect(parseAreaFilter(param as string | string[] | undefined, cookie)).toBe(expected);
  });
});

describe('matchesArea', () => {
  it('sin área cuenta como Personal', () => {
    expect(matchesArea(null, 'personal')).toBe(true);
    expect(matchesArea(null, 'trabajo')).toBe(false);
  });
  it('Todo deja pasar las dos', () => {
    expect(matchesArea('trabajo', 'todo')).toBe(true);
    expect(matchesArea('personal', 'todo')).toBe(true);
  });
  it('Trabajo solo lo de trabajo', () => {
    expect(matchesArea('trabajo', 'trabajo')).toBe(true);
    expect(matchesArea('personal', 'trabajo')).toBe(false);
  });
});

describe('captureAreaParam (la barra de captura sigue el filtro)', () => {
  it('?area= manda; si no, la cookie del filtro', async () => {
    const { captureAreaParam } = await import('@/lib/area');
    expect(captureAreaParam('personal', 'area=trabajo')).toBe('personal');
    expect(captureAreaParam(null, 'otra=1; area=trabajo')).toBe('trabajo');
    expect(captureAreaParam(null, '')).toBeNull();
    expect(captureAreaParam(null, 'area=xx')).toBeNull();
  });
});
