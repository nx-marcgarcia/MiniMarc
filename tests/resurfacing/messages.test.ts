import { describe, expect, it } from 'vitest';
import type { Digest } from '@/lib/digest/build';
import type { Candidate } from '@/lib/resurfacing/candidates';
import { briefingLines, escapeHtml, KIND_LABELS, parseCallback, reminderButtons, reminderLines } from '@/lib/resurfacing/messages';
import { makeItem } from '../screens/setup';

const digest = (over: Partial<Digest> = {}): Digest => ({
  date: '2026-11-17',
  events: [],
  calendarError: null,
  tasks: { personal: { items: [], more: 0 }, trabajo: { items: [], more: 0 } },
  unclassified: 0,
  dates: [],
  headline: 'Buenos días. Día tranquilo.',
  ...over,
});
const task = (id: string, overdue: boolean) => ({ item: makeItem({ id, title: id }), overdue });
const cand = (over: Partial<Candidate> = {}): Candidate => ({ subject: 'item:a', itemId: 'a', kind: 'atrasada', urgent: true, rank: 1, title: 'Llamar al seguro', detail: 'Venció hace 3 días', askArchive: false, ...over });

describe('briefingLines', () => {
  it('un día vacío es una sola línea, no un informe vacío', () => {
    expect(briefingLines(digest(), null)).toEqual(['Buenos días. Día tranquilo.']);
  });

  it('cuenta tareas (con las atrasadas), citas, bandeja y lo rescatado', () => {
    const lines = briefingLines(
      digest({
        headline: 'Buenos días',
        events: [{ id: 'e', title: 'Dentista', startsAt: '', endsAt: '' }],
        tasks: { personal: { items: [task('a', true), task('b', false), task('c', false)], more: 0 }, trabajo: { items: [], more: 0 } },
        unclassified: 4,
      }),
      cand({ kind: 'idea_olvidada', title: 'App de recetas', detail: 'Sin tocar hace 45 días' }),
    );
    expect(lines).toEqual([
      'Buenos días',
      'Hoy: 3 tareas (1 atrasada) · 1 cita',
      'Bandeja: 4 por revisar',
      'Rescatado: «App de recetas» · Sin tocar hace 45 días',
    ]);
  });

  it('las tareas de Trabajo solo cuentan, sin títulos', () => {
    const lines = briefingLines(digest({ headline: 'Buenos días', tasks: { personal: { items: [], more: 0 }, trabajo: { items: [task('secreto', false)], more: 2 } } }), null);
    expect(lines.join('\n')).toContain('3 de Trabajo');
    expect(lines.join('\n')).not.toContain('secreto');
  });

  it('las fechas próximas nombran a la persona y avisan si falta regalo', () => {
    const lines = briefingLines(
      digest({
        headline: 'Buenos días',
        dates: [
          { person: { id: 'p1', name: 'Ana' }, kind: 'birthday', dateId: null, label: 'Cumpleaños', date: '2026-11-20', daysUntil: 3, giftIdeas: [] },
          { person: { id: 'p2', name: 'Luis' }, kind: 'birthday', dateId: null, label: 'Cumpleaños', date: '2026-11-21', daysUntil: 4, giftIdeas: [makeItem({ status: 'comprado' })] },
        ] as unknown as Digest['dates'],
      }),
      null,
    );
    expect(lines).toContain('Fechas: cumpleaños de Ana en 3 días (sin regalo comprado) · cumpleaños de Luis en 4 días');
  });
});

describe('reminderLines', () => {
  it('título del tipo, el item entre comillas y por qué', () => {
    expect(reminderLines(cand())).toEqual(['Atrasada', '«Llamar al seguro»', 'Venció hace 3 días']);
  });

  it('a la tercera pospuesta pregunta si se archiva', () => {
    expect(reminderLines(cand({ askArchive: true, kind: 'idea_olvidada', detail: 'Sin tocar hace 40 días' }))).toEqual([
      'Idea olvidada',
      '«Llamar al seguro»',
      'Sin tocar hace 40 días',
      'Lo has pospuesto 3 veces. ¿Lo archivo?',
    ]);
  });

  it('todos los tipos tienen etiqueta', () => {
    expect(Object.keys(KIND_LABELS).sort()).toEqual(['atrasada', 'compra_urgente', 'con_hora', 'enlace_olvidado', 'garantia', 'idea_olvidada', 'libro_pendiente', 'regalo_sin_comprar', 'vence_hoy']);
  });
});

describe('reminderButtons y parseCallback', () => {
  const url = 'https://mini-marc-personal.vercel.app';

  it('un item lleva Hecho, Posponer 1 semana, Archivar y Abrir (a su pantalla)', () => {
    const rows = reminderButtons('ev1', cand(), { appUrl: url, href: '/tareas' });
    expect(rows.flat()).toEqual([
      { text: 'Hecho', callback_data: 'r:ev1:hecho' },
      { text: 'Posponer 1 semana', callback_data: 'r:ev1:posponer' },
      { text: 'Archivar', callback_data: 'r:ev1:archivar' },
      { text: 'Abrir', url: 'https://mini-marc-personal.vercel.app/tareas' },
    ]);
  });

  it('una fecha de una persona (sin item) solo puede posponerse o abrirse', () => {
    const rows = reminderButtons('ev2', cand({ itemId: null, subject: 'date:p1:2026-11-20', kind: 'regalo_sin_comprar' }), { appUrl: url, href: '/personas/p1' });
    expect(rows.flat().map((b) => b.text)).toEqual(['Posponer 1 semana', 'Abrir']);
  });

  it('el callback cabe en los 64 bytes de Telegram y se lee de vuelta', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const rows = reminderButtons(id, cand(), { appUrl: url, href: '/tareas' });
    for (const b of rows.flat()) if ('callback_data' in b) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
    expect(parseCallback(`r:${id}:archivar`)).toEqual({ eventId: id, action: 'archivar' });
  });

  it('un callback ajeno o roto no se interpreta', () => {
    expect(parseCallback('x:1:hecho')).toBeNull();
    expect(parseCallback('r:ev1:borrar_todo')).toBeNull();
    expect(parseCallback('r:ev1')).toBeNull();
    expect(parseCallback('')).toBeNull();
  });
});

describe('escapeHtml', () => {
  it('escapa lo que Telegram interpretaría como HTML', () => {
    expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });
});
