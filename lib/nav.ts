/** App sections, as used by the tab bar (iPhone) and the sidebar (desktop). */
export type Section =
  | 'hoy'
  | 'semana'
  | 'agenda'
  | 'tareas'
  | 'ideas'
  | 'compras'
  | 'regalos'
  | 'libros'
  | 'enlaces'
  | 'personas'
  | 'notas'
  | 'proyectos'
  | 'sin-clasificar'
  | 'bandeja'
  | 'listas'
  | 'biblioteca'
  | 'archivo'
  | 'revision'
  | 'buscar'
  | 'ajustes';

const SECTIONS: Section[] = [
  'hoy',
  'semana',
  'agenda',
  'tareas',
  'ideas',
  'compras',
  'regalos',
  'libros',
  'enlaces',
  'personas',
  'notas',
  'proyectos',
  'sin-clasificar',
  'bandeja',
  'listas',
  'biblioteca',
  'archivo',
  'revision',
  'buscar',
  'ajustes',
];

/** Section of a pathname ("/regalos/123" → "regalos"), or null outside the app. */
export function sectionFor(pathname: string): Section | null {
  const first = pathname.split('/')[1] ?? '';
  return (SECTIONS as string[]).includes(first) ? (first as Section) : null;
}

/**
 * The tab bar has five slots: Hoy (with Semana and Calendario), Bandeja (both of its views),
 * Tareas, Proyectos and Biblioteca (every collection, Archivo, Revisión semanal and Ajustes).
 */
export function tabFor(section: Section | null): string {
  switch (section) {
    case null:
      return '';
    case 'semana':
    case 'agenda':
      return 'hoy';
    case 'sin-clasificar':
    case 'bandeja':
      return 'bandeja';
    case 'hoy':
    case 'tareas':
    case 'proyectos':
    case 'buscar':
      return section;
    default:
      return 'biblioteca';
  }
}

/** "Volver a entrar con Google" when Calendar refuses: forces Google's consent so a fresh refresh token comes back. */
export const RECONNECT_HREF = '/login?reconsent=1';

/** The Bandeja's "Últimas 24 h" view: what was captured in the last 24 h (where a capture lands). */
export const BANDEJA_HREF = '/bandeja';

/** The Bandeja's "Por revisar" view (what the AI was not sure about): where the Bandeja tab opens. */
export const REVISAR_HREF = '/sin-clasificar';

/** The search screen, and the id of its field (the `/` and ⌘K shortcuts focus it). */
export const BUSCAR_HREF = '/buscar';
export const SEARCH_INPUT_ID = 'buscar';

/** id of the CaptureBar's field. "Capturar" focuses it; without it (no JS yet) it opens the Bandeja. */
export const CAPTURE_INPUT_ID = 'capturar';
