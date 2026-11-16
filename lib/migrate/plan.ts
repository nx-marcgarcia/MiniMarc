/**
 * Migración a la fase 1 (scripts/migrate-v2.ts): de una exportación JSON de la app a un PLAN, que es
 * una lista de operaciones que se puede leer, corregir y aplicar después (lib/migrate/apply.ts).
 *
 * Este módulo no toca ninguna base de datos: lee la exportación y pregunta a la IA, que entra por
 * `MigrationAi` (en los tests es un doble). Reglas:
 *  - Nada con área Trabajo llega nunca a la IA.
 *  - Una compra con varios productos se separa en una compra por producto con su tienda; la original
 *    se ARCHIVA (no se borra) y cada compra nueva guarda su texto original. Con un solo producto
 *    se actualiza en su sitio.
 *  - Las ideas de regalo escritas en las notas de una persona pasan a ser regalos enlazados a ella.
 *    Las notas no se tocan salvo que se pida (`cleanNotes`).
 *  - Lo dudoso (ideas que no lo son, confianza baja) va a la Bandeja (needsReview).
 *  - Las ideas que estaban en "hecho" se listan para que Marc decida; por defecto, en_marcha.
 *  - Los ids de lo que se crea son deterministas (deriveId): aplicar el plan dos veces no duplica.
 *  - Si la IA falla con un item, ese queda como estaba y el resto sigue.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isItemType, isValidStatus, normalizeLegacyStatus, type ItemTypeId } from '@/lib/items/itemTypes';
import { nameKey } from '@/lib/search/normalize';

// ---------- Entrada: una exportación (también las anteriores a la fase 1) ----------

const text = z.string().nullish();

const legacyItem = z.looseObject({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  notes: text,
  area: text,
  status: z.string().default('pendiente'),
  /** El valor que hay en la base de datos, antes de traducirlo (exportaciones de la fase 1 en adelante). */
  rawStatus: text,
  archived: z.boolean().optional(),
  storeId: text,
  personId: text,
  link: text,
  linkTitle: text,
  linkImage: text,
  linkSite: text,
  author: text,
  readingState: text,
  sourceText: text,
  needsReview: z.boolean().optional(),
  confidence: z.number().nullish(),
  data: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  deletedAt: text,
});

const legacyPerson = z.looseObject({ id: z.string(), name: z.string(), birthday: text, notes: text });

const exportSchema = z.looseObject({ items: z.array(legacyItem), people: z.array(legacyPerson) });

type LegacyItem = z.infer<typeof legacyItem>;
type LegacyPerson = z.infer<typeof legacyPerson>;

// ---------- La IA que hace falta ----------

export type StoreRef = { name: string; domain?: string };

export interface MigrationAi {
  /** ¿Es un producto o varios? ¿De qué tienda? Con el título, las notas y el enlace (y su título de vista previa). */
  splitCompra(input: {
    title: string;
    notes: string | null;
    link: string | null;
    linkTitle: string | null;
  }): Promise<{
    store: { name: string; domain: string | null } | null;
    products: { title: string; link: string | null; price: number | null; notes: string | null }[];
  }>;
  /** Las ideas de regalo que hay escritas en las notas de una persona, y las notas sin ellas. */
  giftsFromNotes(input: { name: string; notes: string }): Promise<{
    gifts: { title: string; approxPrice: number | null; link: string | null }[];
    remainingNotes: string;
  }>;
  /** ¿Esto es de verdad una idea? Si no, qué sería. */
  checkIdea(input: { title: string; notes: string | null }): Promise<{
    isIdea: boolean;
    confidence: number;
    suggestion: ItemTypeId | null;
  }>;
}

// ---------- El plan ----------

export type Op =
  | {
      op: 'update-item';
      id: string;
      reason: string;
      patch: {
        title?: string;
        notes?: string | null;
        status?: string;
        needsReview?: boolean;
        sourceText?: string;
        data?: Record<string, unknown>;
        store?: StoreRef;
      };
    }
  | {
      op: 'create-item';
      id: string;
      reason: string;
      createdAt: string;
      item: {
        type: ItemTypeId;
        title: string;
        notes?: string | null;
        status?: string;
        personId?: string;
        store?: StoreRef;
        link?: string;
        sourceText?: string;
        data?: Record<string, unknown>;
      };
    }
  | { op: 'archive-item'; id: string; reason: string }
  | { op: 'add-link'; itemId: string; url: string; title?: string | null; image?: string | null; reason: string }
  | { op: 'merge-person'; keep: string; drop: string[]; reason: string }
  | { op: 'set-person-notes'; id: string; notes: string; reason: string };

export type ReportLine = { id: string; title: string; text: string };
export type DecisionNeeded = { id: string; title: string; default: string };
export type Failure = { id: string; title: string; step: string; error: string };

export interface Plan {
  version: 1;
  createdAt: string;
  ops: Op[];
  report: ReportLine[];
  /** Ideas que estaban en "hecho": Marc decide una a una (por defecto, en_marcha). */
  decisions: DecisionNeeded[];
  failures: Failure[];
}

export interface PlanOptions {
  now?: Date;
  /** idea id → estado de idea que Marc ha elegido para ella. */
  ideasDone?: Record<string, string>;
  /** Reescribe las notas de cada persona con lo que queda tras sacar los regalos. */
  cleanNotes?: boolean;
}

/** Por debajo de esta confianza (o si no es una idea) una idea va a la Bandeja. */
export const IDEA_MIN_CONFIDENCE = 0.6;
const DEFAULT_IDEA_DONE = 'en_marcha';

/** Un uuid (versión 5) que sale siempre igual de las mismas partes: es lo que hace repetible la migración. */
export function deriveId(...parts: string[]): string {
  const h = createHash('sha256').update(parts.join('\u0000')).digest('hex');
  const variant = '89ab'[Number.parseInt(h[16], 16) % 4];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const message = (err: unknown) => (err instanceof Error ? err.message : 'error desconocido');
const originalText = (i: LegacyItem) => [i.title, i.notes].filter(Boolean).join('\n');

export async function buildPlan(input: unknown, ai: MigrationAi, opts: PlanOptions = {}): Promise<Plan> {
  const data = exportSchema.parse(input);
  const now = opts.now ?? new Date();
  const plan: Plan = { version: 1, createdAt: now.toISOString(), ops: [], report: [], decisions: [], failures: [] };
  const note = (id: string, title: string, line: string) => plan.report.push({ id, title, text: line });
  const fail = (i: { id: string; title?: string; name?: string }, step: string, err: unknown) =>
    plan.failures.push({ id: i.id, title: i.title ?? i.name ?? '', step, error: message(err) });

  const items = data.items.map((i) => {
    const legacy = i.rawStatus ?? i.status;
    const norm = isItemType(i.type)
      ? normalizeLegacyStatus(i.type, legacy, i.readingState ?? null)
      : { status: i.status, archived: false };
    return { ...i, legacy, status: norm.status, archived: Boolean(i.archived) || norm.archived };
  });
  const live = items.filter((i) => !i.deletedAt);
  /** Lo que se puede mirar con la IA: vivo, sin archivar y que no sea de Trabajo. */
  const forAi = live.filter((i) => !i.archived && i.area !== 'trabajo');

  // ---- Personas duplicadas: la que más items tiene se queda ----
  const groups = new Map<string, LegacyPerson[]>();
  for (const p of data.people) groups.set(nameKey(p.name), [...(groups.get(nameKey(p.name)) ?? []), p]);
  const canonical = new Map<string, string>();
  for (const group of groups.values()) {
    const count = (p: LegacyPerson) => live.filter((i) => i.personId === p.id).length;
    const keep = [...group].sort((a, b) => count(b) - count(a))[0];
    for (const p of group) canonical.set(p.id, keep.id);
    if (group.length > 1) {
      const drop = group.filter((p) => p.id !== keep.id);
      plan.ops.push({
        op: 'merge-person',
        keep: keep.id,
        drop: drop.map((p) => p.id),
        reason: `«${group.map((p) => p.name).join('», «')}» es la misma persona`,
      });
      note(keep.id, keep.name, `Se fusiona con ${drop.map((p) => `«${p.name}»`).join(', ')}`);
    }
  }

  // ---- Compras: productos y tienda ----
  for (const item of forAi.filter((i) => i.type === 'compra' && !i.storeId && !i.needsReview)) {
    let split;
    try {
      split = await ai.splitCompra({ title: item.title, notes: item.notes ?? null, link: item.link ?? null, linkTitle: item.linkTitle ?? null });
    } catch (err) {
      fail(item, 'compra', err);
      continue;
    }
    const store: StoreRef | undefined = split.store ? { name: split.store.name, ...(split.store.domain && { domain: split.store.domain }) } : undefined;
    const products = split.products.filter((p) => p.title.trim());
    if (products.length === 0) {
      fail(item, 'compra', new Error('la IA no ha encontrado ningún producto'));
      continue;
    }
    if (products.length === 1) {
      const [p] = products;
      const patch: Extract<Op, { op: 'update-item' }>['patch'] = {};
      if (p.title !== item.title) patch.title = p.title;
      if (p.notes && p.notes !== item.notes) patch.notes = p.notes;
      if (store) patch.store = store;
      if (p.price != null) patch.data = { ...(item.data ?? {}), price: p.price };
      if (Object.keys(patch).length > 0) {
        if (!item.sourceText) patch.sourceText = originalText(item);
        plan.ops.push({ op: 'update-item', id: item.id, reason: 'un solo producto: se completa en su sitio', patch });
        note(item.id, item.title, `Compra → «${patch.title ?? item.title}»${store ? ` en ${store.name}` : ''}`);
      }
      if (p.link && p.link !== item.link) plan.ops.push({ op: 'add-link', itemId: item.id, url: p.link, reason: 'enlace del producto' });
      continue;
    }
    products.forEach((p, n) => {
      plan.ops.push({
        op: 'create-item',
        id: deriveId(item.id, String(n)),
        reason: `producto ${n + 1} de ${products.length} de «${item.title}»`,
        createdAt: item.createdAt,
        item: {
          type: 'compra',
          title: p.title,
          ...(p.notes && { notes: p.notes }),
          status: item.status,
          ...(store && { store }),
          ...(p.link && { link: p.link }),
          ...(p.price != null && { data: { price: p.price } }),
          sourceText: originalText(item),
        },
      });
    });
    plan.ops.push({ op: 'archive-item', id: item.id, reason: `separada en ${products.length} compras` });
    note(item.id, item.title, `Compra → ${products.length} compras${store ? ` en ${store.name}` : ''}: ${products.map((p) => `«${p.title}»`).join(', ')}`);
  }

  // ---- Ideas: lo dudoso a la Bandeja, y las que estaban en "hecho" a decisión ----
  for (const item of forAi.filter((i) => i.type === 'idea')) {
    if (item.legacy === 'hecho') {
      plan.decisions.push({ id: item.id, title: item.title, default: DEFAULT_IDEA_DONE });
      const chosen = opts.ideasDone?.[item.id];
      if (chosen !== undefined) {
        if (!isValidStatus('idea', chosen)) throw new Error(`«${chosen}» no es un estado de idea (idea ${item.id})`);
        if (chosen !== DEFAULT_IDEA_DONE) {
          plan.ops.push({ op: 'update-item', id: item.id, reason: 'decisión de Marc', patch: { status: chosen } });
          note(item.id, item.title, `Idea hecha → ${chosen}`);
        }
      }
    }
    if (item.needsReview) continue;
    try {
      const check = await ai.checkIdea({ title: item.title, notes: item.notes ?? null });
      if (!check.isIdea || check.confidence < IDEA_MIN_CONFIDENCE) {
        plan.ops.push({
          op: 'update-item',
          id: item.id,
          reason: check.isIdea ? 'confianza baja' : `no parece una idea${check.suggestion ? `, sería ${check.suggestion}` : ''}`,
          patch: { needsReview: true },
        });
        note(item.id, item.title, `Idea dudosa → Bandeja${check.suggestion ? ` (sugerencia: ${check.suggestion})` : ''}`);
      }
    } catch (err) {
      fail(item, 'idea', err);
    }
  }

  // ---- Libros: el autor pasa a sus campos propios ----
  for (const item of live.filter((i) => i.type === 'libro' && i.author && !i.data?.author)) {
    plan.ops.push({ op: 'update-item', id: item.id, reason: 'autor del libro', patch: { data: { ...(item.data ?? {}), author: item.author as string } } });
  }

  // ---- Enlaces: el enlace de cada item pasa a item_links, con su vista previa ----
  for (const item of live.filter((i) => i.link)) {
    plan.ops.push({ op: 'add-link', itemId: item.id, url: item.link as string, title: item.linkTitle ?? null, image: item.linkImage ?? null, reason: 'enlace del item' });
  }

  // ---- Personas: las ideas de regalo escritas en sus notas ----
  const haveGift = new Set(live.filter((i) => i.type === 'regalo' && i.personId).map((i) => `${canonical.get(i.personId as string) ?? i.personId}:${nameKey(i.title)}`));
  for (const person of data.people.filter((p) => p.notes?.trim())) {
    const target = canonical.get(person.id) ?? person.id;
    let found;
    try {
      found = await ai.giftsFromNotes({ name: person.name, notes: person.notes as string });
    } catch (err) {
      fail(person, 'persona', err);
      continue;
    }
    for (const g of found.gifts.filter((x) => x.title.trim())) {
      if (haveGift.has(`${target}:${nameKey(g.title)}`)) {
        note(person.id, person.name, `Regalo «${g.title}»: ya existe, se deja`);
        continue;
      }
      haveGift.add(`${target}:${nameKey(g.title)}`);
      plan.ops.push({
        op: 'create-item',
        id: deriveId(person.id, 'gift', nameKey(g.title)),
        reason: `idea de regalo en las notas de ${person.name}`,
        createdAt: now.toISOString(),
        item: {
          type: 'regalo',
          title: g.title,
          status: 'idea',
          personId: target,
          ...(g.link && { link: g.link }),
          ...(g.approxPrice != null && { data: { approxPrice: g.approxPrice } }),
          sourceText: person.notes as string,
        },
      });
      note(person.id, person.name, `Regalo «${g.title}»${g.approxPrice != null ? ` (~${g.approxPrice} €)` : ''}`);
    }
    if (opts.cleanNotes && found.remainingNotes.trim() !== (person.notes ?? '').trim()) {
      plan.ops.push({ op: 'set-person-notes', id: person.id, notes: found.remainingNotes.trim(), reason: 'notas sin las ideas de regalo' });
    }
  }

  return plan;
}

/** El plan en texto, para leerlo antes de aplicarlo. */
export function renderReport(plan: Plan): string {
  const count = (kind: Op['op']) => plan.ops.filter((o) => o.op === kind).length;
  const lines = [
    `Plan de migración (${plan.createdAt})`,
    '',
    `  ${count('create-item')} items nuevos · ${count('update-item')} cambios · ${count('archive-item')} archivados`,
    `  ${count('add-link')} enlaces · ${count('merge-person')} personas fusionadas · ${count('set-person-notes')} notas reescritas`,
    `  ${plan.decisions.length} ideas por decidir · ${plan.failures.length} fallos`,
    '',
  ];
  if (plan.report.length) {
    lines.push('Qué cambia:');
    for (const r of plan.report) lines.push(`  · «${r.title}»: ${r.text}`);
    lines.push('');
  }
  if (plan.decisions.length) {
    lines.push('Ideas que estaban en «hecho» (valor por defecto: en_marcha). Para cambiarlas, escribe su estado en backups/migration-decisions.json:');
    for (const d of plan.decisions) lines.push(`  · ${d.id}  «${d.title}»  → ${d.default}`);
    lines.push('  Estados: semilla, explorando, en_marcha, descartada');
    lines.push('');
  }
  if (plan.failures.length) {
    lines.push('Se han dejado como estaban (la IA falló):');
    for (const f of plan.failures) lines.push(`  · «${f.title}» (${f.step}): ${f.error}`);
    lines.push('');
  }
  return lines.join('\n');
}
