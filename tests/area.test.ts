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
