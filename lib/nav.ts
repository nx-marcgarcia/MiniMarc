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
  | 'sin-clasificar'
  | 'bandeja'
  | 'listas'
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
  'sin-clasificar',
  'bandeja',
  'listas',
  'buscar',
  'ajustes',
];

/** Section of a pathname ("/regalos/123" → "regalos"), or null outside the app. */
export function sectionFor(pathname: string): Section | null {
  const first = pathname.split('/')[1] ?? '';
  return (SECTIONS as string[]).includes(first) ? (first as Section) : null;
}

/**
 * The tab bar has five slots: Hoy (with the week), Agenda, Tareas, Bandeja (both of its views)
 * and Listas (every collection, plus Ajustes, which is not a tab).
 */
export function tabFor(section: Section | null): string {
  if (section === 'semana') return 'hoy';
  if (section === 'sin-clasificar' || section === 'bandeja') return 'bandeja';
  if (
    section === 'ideas' ||
    section === 'notas' ||
    section === 'compras' ||
    section === 'regalos' ||
    section === 'libros' ||
    section === 'enlaces' ||
    section === 'personas' ||
    section === 'ajustes'
  ) {
    return 'listas';
  }
  return section ?? '';
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
