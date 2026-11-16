/**
 * A small Open Graph / Twitter card reader for link previews. Pure and dependency-free: regexes
 * over the first 512 KB of HTML (the fetch caps it), not a full HTML parser. Only reads <meta>
 * and <title>, after dropping comments, scripts and styles.
 */

/** `price` and `currency` are only there when the page gives them (a shop page: product tags or JSON-LD). */
export type LinkPreview = { title: string | null; image: string | null; site: string | null; price?: number; currency?: string };

const TITLE_MAX = 300;
const SITE_MAX = 100;
const IMAGE_MAX = 2000;

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
  ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è', ograve: 'ò', iexcl: '¡', iquest: '¿',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', euro: '€', copy: '©', reg: '®', trade: '™', middot: '·',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[code] ?? m;
  });
}

const clean = (s: string | undefined, max: number): string | null => {
  const v = s === undefined ? '' : decodeEntities(s).replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, max) : null;
};

/** name → value of every attribute of one tag ("<meta a="1" b='2' c=3>"), names lowercased. */
function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of tag.matchAll(re)) out[m[1].toLowerCase()] ??= m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function absoluteImage(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    const url = new URL(src, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.length <= IMAGE_MAX ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * "29,99", "1.299,00", "1,299.50", "€ 45" → a number above zero, or null. With both separators the
 * last one is the decimal; with one kind, it is thousands when repeated or when exactly three digits
 * follow it ("1.299"), else the decimal ("29.99", "12,5").
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[^\d.,-]/g, '');
  if (!s || s.includes('-')) return null;
  const dots = s.split('.').length - 1;
  const commas = s.split(',').length - 1;
  let normalized: string;
  if (dots > 0 && commas > 0) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    normalized = s.split(decimal === '.' ? ',' : '.').join('').replace(decimal, '.');
  } else if (dots + commas > 0) {
    const sep = dots > 0 ? '.' : ',';
    const parts = s.split(sep);
    const thousands = parts.length > 2 || (parts[1].length === 3 && parts[0].length >= 1 && parts[0].length <= 3);
    normalized = thousands ? parts.join('') : parts.join('.');
  } else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Price = { amount: number; currency?: string };

const currencyOf = (c: unknown): string | undefined => (typeof c === 'string' && /^[A-Za-z]{3}$/.test(c.trim()) ? c.trim().toUpperCase() : undefined);

/** The first offer with a usable price in a JSON-LD node (an Offer, a list of them, an @graph, or a Product with `offers`). */
function offerPrice(node: unknown, depth = 0): Price | null {
  if (depth > 4 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = offerPrice(n, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const raw = o.price ?? o.lowPrice;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const amount = parseAmount(String(raw));
    if (amount) return { amount, currency: currencyOf(o.priceCurrency) };
  }
  for (const key of ['offers', '@graph', 'mainEntity']) {
    const found = offerPrice(o[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** The price of the product the page sells, from its JSON-LD (read before scripts are dropped). */
function jsonLdPrice(html: string): Price | null {
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      const found = offerPrice(JSON.parse(m[1]));
      if (found) return found;
    } catch {
      // Not valid JSON: a page with a broken block still has its og: tags.
    }
  }
  return null;
}

/** Title, image (absolute, http/https only) and site name of a page; null for what is missing. */
export function parsePreview(html: string, baseUrl: string): LinkPreview {
  const jsonLd = jsonLdPrice(html);
  const doc = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');

  const meta = new Map<string, string>();
  for (const m of doc.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.property ?? a.name ?? '').toLowerCase().trim();
    const value = a.content;
    if (!key || value === undefined || !value.trim() || meta.has(key)) continue;
    meta.set(key, value);
  }
  const first = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v !== undefined);

  const titleTag = doc.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const title = clean(first('og:title', 'twitter:title'), TITLE_MAX) ?? clean(titleTag, TITLE_MAX);
  const image = absoluteImage(
    clean(first('og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'), IMAGE_MAX),
    baseUrl,
  );
  const site = clean(first('og:site_name', 'application-name'), SITE_MAX);
  const metaAmount = parseAmount(first('product:price:amount', 'og:price:amount') ?? '');
  const price: Price | null = metaAmount
    ? { amount: metaAmount, currency: currencyOf(first('product:price:currency', 'og:price:currency')) }
    : jsonLd;
  return { title, image, site, ...(price && { price: price.amount, ...(price.currency && { currency: price.currency }) }) };
}
