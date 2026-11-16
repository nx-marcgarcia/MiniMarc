import { describe, expect, it } from 'vitest';
import type { UpcomingDate } from '@/lib/db/people';
import type { Person } from '@/lib/db/types';
import type { ResurfacingEvent } from '@/lib/db/resurfacing';
import { findCandidates, pickCandidate, type Candidate } from '@/lib/resurfacing/candidates';
import { madridToUtc } from '@/lib/time';
import { makeItem } from '../screens/setup';

const NOW = madridToUtc('2026-11-17', '11:00'); // martes
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const person = (id: string, name: string, relation: Person['relation'] = 'amigo') => ({ id, name, relation }) as Person;
const upcoming = (p: Person, daysUntil: number, label = 'Cumpleaños'): UpcomingDate => ({ person: p, kind: 'birthday', dateId: null, label, date: '2026-11-20', daysUntil });
const event = (subject: string, daysAgo: number): ResurfacingEvent => ({ id: subject, itemId: null, subject, kind: 'x', channel: 'telegram', sentAt: ago(daysAgo), action: null, actedAt: null, telegramMessageId: null });

const find = (over: Partial<Parameters<typeof findCandidates>[0]> = {}) =>
  findCandidates({ now: NOW, tz: 'Europe/Madrid', items: [], upcoming: [], sent: [], ...over });
const kinds = (cs: Candidate[]) => cs.map((c) => `${c.kind}:${c.subject}`);

const tarea = (id: string, over: Record<string, unknown> = {}) => makeItem({ id, type: 'tarea', title: `Tarea ${id}`, status: 'pendiente', area: 'personal', createdAt: ago(60), updatedAt: ago(60), ...over });
const idea = (id: string, over: Record<string, unknown> = {}) => makeItem({ id, type: 'idea', title: `Idea ${id}`, status: 'semilla', area: null, createdAt: ago(90), updatedAt: ago(90), ...over });

describe('qué puede volver a salir', () => {
  it('una tarea atrasada, con cuánto', () => {
    const [c] = find({ items: [tarea('a', { dueAt: ago(3) })] });
    expect(c).toMatchObject({ kind: 'atrasada', subject: 'item:a', itemId: 'a', urgent: true, title: 'Tarea a' });
    expect(c.detail).toMatch(/hace 3 días/);
  });

  it('una tarea sin hora que vence hoy; una con hora de hoy no (esa avisa a su hora)', () => {
    expect(kinds(find({ items: [tarea('a', { dueAt: madridToUtc('2026-11-17', '00:00').toISOString() })] }))).toEqual(['vence_hoy:item:a']);
    expect(find({ items: [tarea('b', { dueAt: madridToUtc('2026-11-17', '15:00').toISOString(), hasTime: true })] })).toEqual([]);
  });

  it('una tarea de mañana o sin fecha no es un recordatorio', () => {
    expect(find({ items: [tarea('a', { dueAt: madridToUtc('2026-11-18', '00:00').toISOString() }), tarea('b')] })).toEqual([]);
  });

  it('una idea sin tocar en 30 días (no una de hace 29, ni una descartada o en marcha)', () => {
    const cs = find({ items: [idea('a', { updatedAt: ago(30) }), idea('b', { updatedAt: ago(29) }), idea('c', { status: 'descartada' }), idea('d', { status: 'en_marcha' })] });
    expect(kinds(cs)).toEqual(['idea_olvidada:item:a']);
    expect(cs[0].detail).toMatch(/30 días/);
  });

  it('un enlace por ver de hace más de 2 meses, y un libro por leer de hace tiempo', () => {
    const cs = find({
      items: [
        makeItem({ id: 'l1', type: 'enlace', title: 'Vídeo', status: 'por_ver', area: null, createdAt: ago(61) }),
        makeItem({ id: 'l2', type: 'enlace', title: 'Visto', status: 'visto', area: null, createdAt: ago(200) }),
        makeItem({ id: 'l3', type: 'enlace', title: 'Reciente', status: 'por_ver', area: null, createdAt: ago(10) }),
        makeItem({ id: 'b1', type: 'libro', title: 'Dune', status: 'por_leer', area: null, createdAt: ago(75) }),
        makeItem({ id: 'b2', type: 'libro', title: 'Leyendo', status: 'leyendo', area: null, createdAt: ago(75) }),
      ],
    });
    expect(kinds(cs).sort()).toEqual(['enlace_olvidado:item:l1', 'libro_pendiente:item:b1']);
  });

  it('una compra urgente que lleva semanas en «quiero»; una normal o reciente no', () => {
    const compra = (id: string, over: Record<string, unknown>) => makeItem({ id, type: 'compra', title: `Compra ${id}`, status: 'quiero', area: null, ...over });
    const cs = find({
      items: [
        compra('a', { data: { urgency: 'alta' }, createdAt: ago(15) }),
        compra('b', { data: { urgency: 'alta' }, createdAt: ago(5) }),
        compra('c', { data: { urgency: 'media' }, createdAt: ago(40) }),
        compra('d', { data: { urgency: 'alta' }, createdAt: ago(40), status: 'comprado' }),
      ],
    });
    expect(kinds(cs)).toEqual(['compra_urgente:item:a']);
  });

  it('una garantía que caduca en un mes (no una ya caducada ni una lejana)', () => {
    const comprada = (id: string, ends: string) => makeItem({ id, type: 'compra', title: `Aspiradora ${id}`, status: 'comprado', area: null, data: { warrantyEndsAt: ends } });
    const cs = find({ items: [comprada('a', '2026-12-10'), comprada('b', '2026-11-01'), comprada('c', '2027-03-01')] });
    expect(kinds(cs)).toEqual(['garantia:item:a']);
    expect(cs[0].detail).toMatch(/23 días/);
  });

  it('un cumpleaños en los próximos 10 días sin regalo comprado, y con regalo comprado no', () => {
    const ana = person('p1', 'Ana');
    const luis = person('p2', 'Luis');
    const gift = (status: string, personId: string) => makeItem({ id: `g-${personId}`, type: 'regalo', title: 'Libro', status, personId, area: null });
    const cs = find({ upcoming: [upcoming(ana, 3), upcoming(luis, 5)], items: [gift('idea', 'p1'), gift('comprado', 'p2')] });
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ kind: 'regalo_sin_comprar', subject: 'date:p1:2026-11-20', itemId: null, urgent: true, title: 'Regalo para Ana' });
    expect(cs[0].detail).toMatch(/Cumpleaños en 3 días/);
  });

  it('un cumpleaños a más de 10 días no sale todavía', () => {
    expect(find({ upcoming: [upcoming(person('p1', 'Ana'), 11)] })).toEqual([]);
  });
});

describe('qué nunca sale', () => {
  it('lo de Trabajo (tareas y personas): no viaja a Telegram', () => {
    const cs = find({
      items: [tarea('t', { area: 'trabajo', dueAt: ago(3) })],
      upcoming: [upcoming(person('p1', 'Jefe', 'trabajo'), 2)],
    });
    expect(cs).toEqual([]);
  });

  it('lo archivado, pendiente de revisión o ya hecho', () => {
    expect(find({ items: [tarea('a', { dueAt: ago(3), archived: true }), tarea('b', { dueAt: ago(3), needsReview: true }), tarea('c', { dueAt: ago(3), status: 'hecha' })] })).toEqual([]);
  });

  it('lo avisado en los últimos 7 días (sí a los 8)', () => {
    const items = [tarea('a', { dueAt: ago(3) }), tarea('b', { dueAt: ago(3) })];
    expect(kinds(find({ items, sent: [event('item:a', 6)] }))).toEqual(['atrasada:item:b']);
    expect(kinds(find({ items, sent: [event('item:a', 8)] }))).toHaveLength(2);
  });

  it('lo pospuesto hasta una fecha futura', () => {
    const items = [tarea('a', { dueAt: ago(3), snoozedUntil: new Date(NOW.getTime() + 2 * DAY).toISOString() }), tarea('b', { dueAt: ago(3), snoozedUntil: ago(1) })];
    expect(kinds(find({ items }))).toEqual(['atrasada:item:b']);
  });
});

describe('a la tercera vez, pregunta si se archiva', () => {
  it('un item pospuesto 3 veces sale marcado para preguntar', () => {
    const [c] = find({ items: [idea('a', { updatedAt: ago(40), snoozeCount: 3 })] });
    expect(c.askArchive).toBe(true);
    expect(find({ items: [idea('a', { updatedAt: ago(40), snoozeCount: 2 })] })[0].askArchive).toBe(false);
  });
});

describe('orden: lo urgente primero, luego lo olvidado', () => {
  it('atrasadas antes que fechas, garantías, compras urgentes y olvidos; la más atrasada primero', () => {
    const ana = person('p1', 'Ana');
    const cs = find({
      items: [
        idea('i', { updatedAt: ago(50) }),
        tarea('t1', { dueAt: ago(2) }),
        tarea('t2', { dueAt: ago(9) }),
        makeItem({ id: 'c', type: 'compra', title: 'Aspiradora', status: 'comprado', area: null, data: { warrantyEndsAt: '2026-12-05' } }),
      ],
      upcoming: [upcoming(ana, 4)],
    });
    expect(kinds(cs)).toEqual(['atrasada:item:t2', 'atrasada:item:t1', 'regalo_sin_comprar:date:p1:2026-11-20', 'garantia:item:c', 'idea_olvidada:item:i']);
  });
});

describe('pickCandidate: mezcla tipos', () => {
  const c = (kind: Candidate['kind'], subject: string, urgent = false): Candidate => ({ kind, subject, itemId: subject, urgent, rank: urgent ? 1 : 6, title: subject, detail: '', askArchive: false });

  it('lo urgente va primero aunque se repita el tipo', () => {
    expect(pickCandidate([c('atrasada', 'a', true), c('idea_olvidada', 'b')], ['atrasada'])?.subject).toBe('a');
  });

  it('entre lo olvidado no repite el tipo del último aviso si hay otro', () => {
    const list = [c('idea_olvidada', 'i1'), c('idea_olvidada', 'i2'), c('libro_pendiente', 'b1')];
    expect(pickCandidate(list, ['idea_olvidada'])?.subject).toBe('b1');
    expect(pickCandidate(list, [])?.subject).toBe('i1');
  });

  it('si solo hay del mismo tipo, sale uno igual (mejor eso que callar)', () => {
    expect(pickCandidate([c('idea_olvidada', 'i1')], ['idea_olvidada'])?.subject).toBe('i1');
  });

  it('sin candidatos, nada', () => {
    expect(pickCandidate([], [])).toBeNull();
  });
});
