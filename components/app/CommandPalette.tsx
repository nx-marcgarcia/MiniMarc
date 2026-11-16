'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { paletteSearch } from '@/app/actions/palette';
import { settle } from '@/lib/actions/result';
import type { Project } from '@/lib/db/projects';
import { itemHref } from '@/lib/items/href';
import { CAPTURE_INPUT_ID } from '@/lib/nav';
import { matchActions } from '@/lib/palette';
import type { SearchResults } from '@/lib/search/query';

type Entry = { id: string; label: string; detail?: string; href?: string; capture?: boolean };

const SEARCH_DELAY_MS = 150;
const PER_GROUP = 8;

/** Typing in a field (or an editable element): `/` is just a character there. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function entriesFrom(query: string, results: SearchResults | null, projects: Project[]): Entry[] {
  const actions: Entry[] = matchActions(query)
    .slice(0, PER_GROUP)
    .map((a) => ({ id: a.id, label: a.label, href: a.href, capture: a.run === 'capture', detail: 'Acción' }));
  const projectEntries: Entry[] = projects.map((p) => ({ id: `p-${p.id}`, label: p.name, detail: 'Proyecto', href: `/proyectos/${p.id}` }));
  const found: Entry[] = (results?.groups ?? []).flatMap((g) =>
    g.kind === 'people'
      ? g.people.slice(0, PER_GROUP).map((p) => ({ id: `per-${p.id}`, label: p.name, detail: g.label, href: `/personas/${p.id}` }))
      : g.items.slice(0, PER_GROUP).map((i) => ({ id: `i-${i.id}`, label: i.title, detail: g.label, href: itemHref(i) })),
  );
  return [...actions, ...projectEntries, ...found];
}

/**
 * ⌘K / Ctrl+K anywhere, or `/` outside a field: one box to go anywhere or do anything (Raycast,
 * Linear). Actions first, then projects and the usual search results. Arrows move, Enter runs,
 * Esc closes. Desktop and iPad keyboards only; on iPhone the magnifier still opens /buscar.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const commandK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target);
      if (!commandK && !slash) return;
      e.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) return;
    let alive = true;
    const timer = setTimeout(() => {
      settle(() => paletteSearch(query), '').then((r) => {
        if (!alive || !r.ok) return;
        setResults(r.value.results);
        setProjects(r.value.projects);
      });
    }, SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const entries = entriesFrom(query, query.trim() ? results : null, query.trim() ? projects : []);
  const current = Math.min(active, Math.max(entries.length - 1, 0));

  function close() {
    setOpen(false);
    setQuery('');
    setActive(0);
    setResults(null);
    setProjects([]);
  }

  function runEntry(entry: Entry | undefined) {
    if (!entry) return;
    close();
    if (entry.capture) {
      const input = document.getElementById(CAPTURE_INPUT_ID);
      if (input instanceof HTMLElement) input.focus();
      return;
    }
    if (entry.href) router.push(entry.href);
  }

  if (!open) return null;

  return (
    <div className="app-palette" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Paleta de comandos" className="ui-glass app-palette__panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="app-palette__input"
          role="combobox"
          aria-label="Buscar o hacer algo"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={entries[current] ? `${listId}-${entries[current].id}` : undefined}
          placeholder="Buscar o hacer algo…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, entries.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              runEntry(entries[current]);
            }
          }}
        />
        <ul id={listId} role="listbox" aria-label="Resultados" className="app-palette__list">
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              id={`${listId}-${entry.id}`}
              role="option"
              aria-selected={i === current}
              className="app-palette__option"
              onMouseEnter={() => setActive(i)}
              onClick={() => runEntry(entry)}
            >
              <span className="app-palette__label">{entry.label}</span>
              {entry.detail && <span className="app-palette__detail">{entry.detail}</span>}
            </li>
          ))}
          {entries.length === 0 && <li className="app-palette__empty">Nada con «{query}».</li>}
        </ul>
      </div>
    </div>
  );
}
