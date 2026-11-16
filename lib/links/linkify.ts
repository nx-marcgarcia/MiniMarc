/**
 * Links inside titles and notes. Pure (no DOM), used by the client (LinkText) and the server
 * (deriveLink on save). Only http and https become links: anything else (javascript:, data:…)
 * stays plain text. Emails (mailto:) and phone numbers (tel:) are tappable too. React renders the
 * segments as text nodes and <a>, never as HTML.
 */

export type LinkSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'email'; text: string; href: string }
  | { kind: 'phone'; text: string; href: string };

/** http(s)://… or www.… up to the next whitespace; trailing punctuation is trimmed below. */
const CANDIDATE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[.,;:!?'»”’…*_]+$/;

/** Longest path segment shown by shortUrl. */
const SEGMENT_MAX = 12;

/** The candidate without trailing punctuation, nor a closing bracket it did not open. */
function trimCandidate(raw: string): string {
  let s = raw;
  for (;;) {
    const before = s;
    s = s.replace(TRAILING, '');
    const last = s.at(-1);
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    if (last && pairs[last]) {
      const open = s.split(pairs[last]).length - 1;
      const close = s.split(last).length - 1;
      if (close > open) s = s.slice(0, -1);
    }
    if (s === before) return s;
  }
}

/** The normalised href when `text` is an http(s) URL with a host; null otherwise. */
export function safeHref(text: string): string | null {
  const raw = /^www\./i.test(text) ? `https://${text}` : text;
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** "amazon.es/…": the domain without www, plus a short first path segment when there is one. */
export function shortUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const host = url.hostname.replace(/^www\./i, '');
  const segs = url.pathname.split('/').filter(Boolean);
  const extra = Boolean(url.search || url.hash);
  if (segs.length === 0) return extra ? `${host}/…` : host;
  const first = decodeSafe(segs[0]);
  if (first.length > SEGMENT_MAX) return `${host}/…`;
  return segs.length === 1 && !extra ? `${host}/${first}` : `${host}/${first}/…`;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------- Correos y teléfonos ----------

const EMAIL = String.raw`(?<![\w.+-])[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+`;
/** +CC and 8 to 14 more digits in groups, separated by spaces or hyphens. */
const PHONE_INTL = String.raw`(?<![\w+])\+\d{1,3}(?:[ -]?\d{2,4}){2,5}(?!\d)`;
/** A Spanish number: 9 digits starting with 6 to 9, as 3-3-3 or 3-2-2-2 (not part of a longer number or a price). */
const PHONE_ES = String.raw`(?<![\w+.,-])[6-9]\d{2}(?:[ -]?\d{3}[ -]?\d{3}|[ -]?\d{2}[ -]?\d{2}[ -]?\d{2})(?![\w]|[.,]\d)`;
const CONTACT = new RegExp(`(${EMAIL})|(${PHONE_INTL})|(${PHONE_ES})`, 'g');

/** Emails and phone numbers inside a stretch of plain text. */
function contacts(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(CONTACT)) {
    const found = m[0];
    const digits = found.replace(/\D/g, '').length;
    // An international number needs 8 to 15 digits in all; anything else is just a number.
    if (m[2] && (digits < 8 || digits > 15)) continue;
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push(m[1] ? { kind: 'email', text: found, href: `mailto:${found}` } : { kind: 'phone', text: found, href: `tel:${found.replace(/[^\d+]/g, '')}` });
    last = m.index + found.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Splits `text` into plain text, http(s) links (shown shortened), emails and phone numbers. */
export function linkify(text: string): LinkSegment[] {
  return linkifyUrls(text).flatMap((s) => (s.kind === 'text' ? contacts(s.text) : [s]));
}

/** Splits `text` into plain text and http(s) links (shown shortened). */
function linkifyUrls(text: string): LinkSegment[] {
  const out: LinkSegment[] = [];
  let last = 0;
  const pushText = (t: string) => {
    if (!t) return;
    const prev = out.at(-1);
    if (prev?.kind === 'text') prev.text += t;
    else out.push({ kind: 'text', text: t });
  };
  for (const m of text.matchAll(CANDIDATE)) {
    const start = m.index;
    const candidate = trimCandidate(m[0]);
    const href = safeHref(candidate);
    if (!href) continue;
    pushText(text.slice(last, start));
    out.push({ kind: 'link', href, text: shortUrl(href) });
    last = start + candidate.length;
  }
  pushText(text.slice(last));
  return out;
}

/** Every http(s) URL in `text`, in order, normalised. */
export function extractUrls(text: string): string[] {
  return linkify(text).flatMap((s) => (s.kind === 'link' ? [s.href] : []));
}

/**
 * The link an item should have when saved: its own `link` if it has one; otherwise the first
 * URL of the title, then of the notes; otherwise null. The one helper every save path uses.
 */
export function deriveLink(f: { title?: string | null; notes?: string | null; link?: string | null }): string | null {
  const own = f.link?.trim();
  if (own) return own;
  return extractUrls(f.title ?? '')[0] ?? extractUrls(f.notes ?? '')[0] ?? null;
}
