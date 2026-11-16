/**
 * Lo que se resuelve en código antes de llamar a la IA (puro, sin red):
 *   - parseShortcuts: los atajos opcionales de la barra de captura (#tag, @persona, !alta, /compra,
 *     $25, >proyecto). Solo cuenta un atajo cuando es una palabra entera: un correo, una URL con
 *     #fragmento, una ruta o un "> 5" no se confunden con uno.
 *   - guessFromLink: si se pega solo un enlace, qué es por su dominio (YouTube → vídeo, tienda
 *     conocida → compra…). Lo desconocido lo decide la IA con la vista previa de la página.
 */
import type { Priority } from '@/lib/db/types';
import type { ItemTypeId } from '@/lib/items/itemTypes';
import { safeHref } from '@/lib/links/linkify';

export interface Shortcuts {
  /** El texto sin los atajos. */
  text: string;
  tags: string[];
  /** Nombre tal como se escribió (con _ como espacio). */
  person?: string;
  priority?: Priority;
  kind?: ItemTypeId;
  price?: number;
  project?: string;
}

const TAG = /^#([\p{L}\p{N}][\p{L}\p{N}_-]*)$/u;
const PERSON = /^@([\p{L}\p{N}][\p{L}\p{N}_.-]*)$/u;
const PRIORITY = /^!(alta|media|baja|urgente)$/i;
const KIND = /^\/(tarea|idea|compra|regalo|libro|nota|enlace)$/i;
const PRICE = /^\$(\d+(?:[.,]\d{1,2})?)$/;
const PROJECT = /^>(\p{L}[\p{L}\p{N}_-]*)$/u;

export function parseShortcuts(raw: string): Shortcuts {
  const out: Shortcuts = { text: raw, tags: [] };
  const spans: [number, number][] = [];

  for (const m of raw.matchAll(/(?<=^|\s)\S+/g)) {
    // "@Rosendo," → the name without the comma that ends the sentence.
    const token = m[0].replace(/[.,;:!?]+$/, '');
    let hit = true;
    let match: RegExpMatchArray | null;
    if ((match = token.match(TAG))) {
      const tag = match[1].toLowerCase();
      if (!out.tags.includes(tag)) out.tags.push(tag);
    } else if ((match = token.match(PERSON))) out.person = match[1].replace(/_/g, ' ');
    else if ((match = token.match(PRIORITY))) out.priority = match[1].toLowerCase() === 'urgente' ? 'alta' : (match[1].toLowerCase() as Priority);
    else if ((match = m[0].match(KIND))) out.kind = match[1].toLowerCase() as ItemTypeId;
    else if ((match = token.match(PRICE))) out.price = Number(match[1].replace(',', '.'));
    else if ((match = token.match(PROJECT))) out.project = match[1].replace(/_/g, ' ');
    else hit = false;
    if (hit) spans.push([m.index, m.index + m[0].length]);
  }
  if (spans.length === 0) return out;

  let text = '';
  let at = 0;
  for (const [start, end] of spans) {
    text += raw.slice(at, start);
    at = end;
  }
  text += raw.slice(at);
  out.text = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
  return out;
}

// ---------- Enlaces sueltos ----------

export type LinkKind = 'articulo' | 'video' | 'short' | 'hilo' | 'herramienta';

export interface LinkGuess {
  /** La URL normalizada. */
  url: string;
  /** null = por el dominio no se sabe: que lo decida la IA con la vista previa. */
  type: ItemTypeId | null;
  linkKind?: LinkKind;
  tags: string[];
  store?: { name: string; domain: string };
}

/** Tiendas en línea habituales. Las del usuario (tabla stores) tienen prioridad. */
const KNOWN_STORES: { test: RegExp; name: string; domain?: string }[] = [
  { test: /(^|\.)amazon\.[a-z.]+$/, name: 'Amazon' },
  { test: /(^|\.)aliexpress\.com$/, name: 'Aliexpress', domain: 'aliexpress.com' },
  { test: /(^|\.)pccomponentes\.com$/, name: 'PcComponentes', domain: 'pccomponentes.com' },
  { test: /(^|\.)ikea\.com$/, name: 'Ikea', domain: 'ikea.com' },
  { test: /(^|\.)zalando\.[a-z.]+$/, name: 'Zalando' },
  { test: /(^|\.)ebay\.[a-z.]+$/, name: 'eBay' },
  { test: /(^|\.)mediamarkt\.es$/, name: 'MediaMarkt', domain: 'mediamarkt.es' },
  { test: /(^|\.)elcorteingles\.es$/, name: 'El Corte Inglés', domain: 'elcorteingles.es' },
  { test: /(^|\.)decathlon\.[a-z.]+$/, name: 'Decathlon' },
  { test: /(^|\.)zara\.com$/, name: 'Zara', domain: 'zara.com' },
  { test: /(^|\.)temu\.com$/, name: 'Temu', domain: 'temu.com' },
  { test: /(^|\.)shein\.[a-z.]+$/, name: 'Shein' },
  { test: /(^|\.)vinted\.[a-z.]+$/, name: 'Vinted' },
];

export function guessFromLink(text: string, userStores: { name: string; domain: string | null }[] = []): LinkGuess | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const url = safeHref(t);
  if (!url) return null;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase();
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  const link = (type: ItemTypeId, extra: Partial<LinkGuess> = {}): LinkGuess => ({ url, type, tags: [], ...extra });

  for (const s of userStores) {
    if (s.domain && is(s.domain)) return link('compra', { store: { name: s.name, domain: s.domain } });
  }
  if (is('youtube.com') || host === 'youtu.be') return link('enlace', { linkKind: path.startsWith('/shorts/') ? 'short' : 'video' });
  if (is('tiktok.com')) return link('enlace', { linkKind: 'short' });
  if (is('instagram.com')) return link('enlace', { linkKind: /^\/reels?\//.test(path) ? 'short' : 'articulo' });
  if (is('x.com') || is('twitter.com')) return link('enlace', { linkKind: 'hilo' });
  if (is('github.com')) return link('enlace', { linkKind: 'herramienta' });
  if (is('goodreads.com')) return link('libro');
  if (host === 'maps.app.goo.gl' || host === 'maps.google.com' || (/^google\.[a-z.]+$/.test(host) && path.startsWith('/maps')) || (host === 'goo.gl' && path.startsWith('/maps'))) {
    return link('enlace', { tags: ['lugar'] });
  }
  const known = KNOWN_STORES.find((s) => s.test.test(host));
  if (known) return link('compra', { store: { name: known.name, domain: known.domain ?? host } });
  return { url, type: null, tags: [] };
}
