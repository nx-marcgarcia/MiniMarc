import Link from 'next/link';
import type { ReactNode } from 'react';
import { Glass, LinkPending, TabBar, type TabBarItem } from '@/components/ui';
import {
  BagIcon,
  BookIcon,
  CaptureIcon,
  FolderIcon,
  GiftIcon,
  GlobeIcon,
  IdeaIcon,
  ListIcon,
  NoteIcon,
  SearchIcon,
  SettingsIcon,
  TasksIcon,
  TodayIcon,
  TrayIcon,
} from '@/components/icons';
import { REVISAR_HREF, tabFor, type Section } from '@/lib/nav';
import { CaptureLink } from './CaptureLink';

/*
 * One job per tab: Hoy (the day; Semana and Calendario are its other views), Bandeja (review
 * what the AI was not sure about, and what came in lately), Tareas and Listas (every collection,
 * plus Ajustes). Capturar is not a tab: on iPhone the CaptureBar floats
 * right above the tab bar; on desktop the sidebar's first action focuses it.
 */
const TABS: TabBarItem[] = [
  { key: 'hoy', label: 'Hoy', href: '/hoy', icon: <TodayIcon /> },
  { key: 'bandeja', label: 'Bandeja', href: REVISAR_HREF, icon: <TrayIcon /> },
  { key: 'tareas', label: 'Tareas', href: '/tareas', icon: <TasksIcon /> },
  { key: 'proyectos', label: 'Proyectos', href: '/proyectos', icon: <FolderIcon /> },
  { key: 'listas', label: 'Listas', href: '/listas', icon: <ListIcon /> },
];

/** `also`: other sections that light up the same link (the second view of a section). */
type SidebarLink = { key: Section; also?: Section[]; label: string; href: string; icon: ReactNode };

/** Same order and groups as the Listas screen, so the two never disagree. */
const SIDEBAR: { header?: string; links: SidebarLink[] }[] = [
  {
    links: [
      { key: 'hoy', also: ['semana', 'agenda'], label: 'Hoy', href: '/hoy', icon: <TodayIcon /> },
      { key: 'sin-clasificar', also: ['bandeja'], label: 'Bandeja', href: REVISAR_HREF, icon: <TrayIcon /> },
      { key: 'tareas', label: 'Tareas', href: '/tareas', icon: <TasksIcon /> },
      { key: 'proyectos', label: 'Proyectos', href: '/proyectos', icon: <FolderIcon /> },
    ],
  },
  {
    header: 'Por conseguir',
    links: [
      { key: 'compras', label: 'Compras', href: '/compras', icon: <BagIcon /> },
      { key: 'personas', also: ['regalos'], label: 'Personas y regalos', href: '/personas', icon: <GiftIcon /> },
    ],
  },
  {
    header: 'Para leer y ver',
    links: [
      { key: 'libros', label: 'Libros', href: '/libros', icon: <BookIcon /> },
      { key: 'enlaces', label: 'Enlaces', href: '/enlaces', icon: <GlobeIcon /> },
    ],
  },
  {
    header: 'Para pensar',
    links: [
      { key: 'ideas', label: 'Ideas', href: '/ideas', icon: <IdeaIcon /> },
      { key: 'notas', label: 'Notas', href: '/notas', icon: <NoteIcon /> },
    ],
  },
  { links: [{ key: 'ajustes', label: 'Ajustes', href: '/ajustes', icon: <SettingsIcon /> }] },
];

const isCurrent = (link: SidebarLink, active: Section | null) =>
  active !== null && (link.key === active || (link.also?.includes(active) ?? false));

/**
 * App navigation: the floating tab bar on iPhone and an iPadOS/macOS-style glass
 * sidebar from 900px (app.css shows one or the other). `active` null = nothing highlighted.
 */
export function AppNav({ active }: { active: Section | null }) {
  return (
    <>
      <Glass as="nav" className="app-sidebar" aria-label="Secciones">
        <p className="app-sidebar__title">Agente</p>
        <CaptureLink className="app-sidebar__link app-sidebar__capture">
          <span className="app-sidebar__icon" aria-hidden>
            <CaptureIcon />
          </span>
          Capturar
        </CaptureLink>
        <Link
          href="/buscar"
          className="app-sidebar__link"
          aria-current={active === 'buscar' ? 'page' : undefined}
          aria-keyshortcuts="/ Meta+K"
        >
          <span className="app-sidebar__icon" aria-hidden>
            <SearchIcon />
          </span>
          Buscar
          <LinkPending />
        </Link>
        {SIDEBAR.map((group, i) => (
          <div key={i} className="app-sidebar__group">
            {group.header && <h2 className="app-sidebar__header">{group.header}</h2>}
            <ul>
              {group.links.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    prefetch
                    className="app-sidebar__link"
                    aria-current={isCurrent(link, active) ? 'page' : undefined}
                  >
                    <span className="app-sidebar__icon" aria-hidden>
                      {link.icon}
                    </span>
                    {link.label}
                    <LinkPending />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Glass>
      <div className="app-tabbar">
        <TabBar items={TABS} active={tabFor(active)} />
      </div>
    </>
  );
}
