/**
 * Finds a book's author, cover and pages from its title: Open Library first, Google Books for
 * whatever it did not bring. Pure (the HTTP call is injected); never throws, a miss is `null`.
 * Only the title (and the author, if known) is sent: nothing else about Marc leaves the app.
 */
import { nameKey } from '@/lib/search/normalize';

export interface BookInfo {
  title?: string;
  author?: string;
  /** https URL of the cover image. */
  cover?: string;
  pages?: number;
}

/** GETs a URL and returns its parsed JSON; rejects on any failure. */
export type BookFetcher = (url: string) => Promise<unknown>;

const OPEN_LIBRARY = 'https://openlibrary.org/search.json';
const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const firstStr = (v: unknown): string | undefined => (Array.isArray(v) ? str(v.find((x) => str(x))) : undefined);
const posInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined);

/** The result is the book asked for: same title, or one contains the other (subtitles). */
function sameBook(found: string | undefined, asked: string): boolean {
  if (!found) return false;
  const a = nameKey(found);
  const b = nameKey(asked);
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.includes(short);
}

const clean = (info: BookInfo): BookInfo => Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined));

export function parseOpenLibrary(json: unknown, title: string): BookInfo | null {
  if (!isRecord(json) || !Array.isArray(json.docs)) return null;
  for (const doc of json.docs) {
    if (!isRecord(doc) || !sameBook(str(doc.title), title)) continue;
    const coverId = posInt(doc.cover_i);
    return clean({
      title: str(doc.title),
      author: firstStr(doc.author_name),
      cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined,
      pages: posInt(doc.number_of_pages_median),
    });
  }
  return null;
}

export function parseGoogleBooks(json: unknown, title: string): BookInfo | null {
  if (!isRecord(json) || !Array.isArray(json.items)) return null;
  for (const item of json.items) {
    const v = isRecord(item) && isRecord(item.volumeInfo) ? item.volumeInfo : null;
    if (!v || !sameBook(str(v.title), title)) continue;
    const thumb = isRecord(v.imageLinks) ? (str(v.imageLinks.thumbnail) ?? str(v.imageLinks.smallThumbnail)) : undefined;
    return clean({
      title: str(v.title),
      author: firstStr(v.authors),
      // http → https; the curled-page effect off.
      cover: thumb?.replace(/^http:/, 'https:').replace(/&edge=curl/, ''),
      pages: posInt(v.pageCount),
    });
  }
  return null;
}

const MIN_TITLE = 2;

export async function lookupBook(title: string, author: string | null, fetcher: BookFetcher): Promise<BookInfo | null> {
  const t = title.trim();
  if (t.length < MIN_TITLE) return null;

  let found: BookInfo | null = null;
  try {
    const q = new URLSearchParams({ title: t, limit: '5', fields: 'title,author_name,cover_i,number_of_pages_median' });
    if (author) q.set('author', author);
    found = parseOpenLibrary(await fetcher(`${OPEN_LIBRARY}?${q}`), t);
  } catch {
    // Open Library down or slow: Google Books may still know it.
  }
  if (found?.author && found.cover) return found;

  try {
    const q = new URLSearchParams({ q: `intitle:${t}${author ? ` inauthor:${author}` : ''}`, maxResults: '5', printType: 'books' });
    const more = parseGoogleBooks(await fetcher(`${GOOGLE_BOOKS}?${q}`), t);
    if (more) return clean({ ...more, ...found });
  } catch {
    // Both down: no data, the book keeps what Marc typed.
  }
  return found;
}
