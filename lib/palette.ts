/** ⌘K's actions (Raycast / Linear style) and how a query picks them. Pure. */
import { nameKey } from '@/lib/search/normalize';

export type PaletteAction = {
  id: string;
  label: string;
  keywords: string[];
  /** Where it goes; or `run`, something done in place. Exactly one of the two. */
  href?: string;
  run?: 'capture';
};

const go = (id: string, label: string, href: string, keywords: string[] = []): PaletteAction => ({
  id: `ir-${id}`,
  label: `Ir a ${label}`,
  href,
  keywords,
});

export const PALETTE_ACTIONS: PaletteAction[] = [
  { id: 'capturar', label: 'Capturar', run: 'capture', keywords: ['apuntar', 'nuevo', 'añadir', 'nota rápida'] },
  { id: 'nuevo-proyecto', label: 'Nuevo proyecto', href: '/proyectos?nuevo=1', keywords: ['crear', 'plan'] },
  { id: 'procesar', label: 'Procesar Bandeja', href: '/sin-clasificar', keywords: ['revisar', 'clasificar', 'bandeja', 'inbox'] },
  { id: 'revision', label: 'Revisión semanal', href: '/revision', keywords: ['revisar', 'semana', 'review'] },
  go('hoy', 'Hoy', '/hoy', ['día', 'today']),
  go('semana', 'Semana', '/semana'),
  go('calendario', 'Calendario', '/agenda', ['agenda', 'citas']),
  go('bandeja', 'Bandeja', '/sin-clasificar', ['inbox', 'recién', 'últimas']),
  go('tareas', 'Tareas', '/tareas', ['pendientes']),
  go('proyectos', 'Proyectos', '/proyectos'),
  go('biblioteca', 'Biblioteca', '/biblioteca', ['listas']),
  go('compras', 'Compras', '/compras', ['tiendas', 'comprar']),
  go('personas', 'Personas', '/personas', ['cumpleaños', 'fechas']),
  go('regalos', 'Regalos', '/regalos'),
  go('libros', 'Libros', '/libros', ['leer']),
  go('enlaces', 'Enlaces', '/enlaces', ['links', 'ver más tarde']),
  go('ideas', 'Ideas', '/ideas'),
  go('notas', 'Notas', '/notas'),
  go('archivo', 'Archivo', '/archivo', ['hecho', 'terminado', 'logbook']),
  go('ajustes', 'Ajustes', '/ajustes', ['avisos', 'telegram', 'configuración']),
];

/** Without a query, all of them; with one, those whose label or keywords contain it (no accents), label prefixes first. */
export function matchActions(query: string, actions: PaletteAction[] = PALETTE_ACTIONS): PaletteAction[] {
  const q = nameKey(query);
  if (!q) return actions;
  const starts: PaletteAction[] = [];
  const contains: PaletteAction[] = [];
  for (const a of actions) {
    const label = nameKey(a.label);
    if (label.startsWith(q) || nameKey(a.label.replace(/^Ir a /, '')).startsWith(q)) starts.push(a);
    else if (label.includes(q) || a.keywords.some((k) => nameKey(k).includes(q))) contains.push(a);
  }
  return [...starts, ...contains];
}
