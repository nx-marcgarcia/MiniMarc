'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AreaFilter } from '@/components/app/AreaFilter';
import { PlusIcon } from '@/components/icons';
import { LargeTitle } from '@/components/ui';
import type { AreaFilter as Filter } from '@/lib/area';
import type { ProjectCard } from '@/lib/cache/reads';
import { countsText } from '@/lib/projects';
import { ProjectSheet } from './ProjectSheet';

export type ProyectosScreenProps = {
  area: Filter;
  /** False before migration 0014. */
  available: boolean;
  active: ProjectCard[];
  paused: ProjectCard[];
  done: ProjectCard[];
};

export const MISSING_MIGRATION = 'Falta aplicar la migración 0014 en Supabase (SQL Editor). El resto de la app funciona igual.';

/** "20 de diciembre" (a calendar day: noon UTC keeps it on the same day in Madrid). */
const dueText = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

function Card({ card }: { card: ProjectCard }) {
  const { project, summary } = card;
  const meta = [project.area === 'trabajo' ? 'Trabajo' : project.area === 'personal' ? 'Personal' : null, countsText(summary.counts) || null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link href={`/proyectos/${project.id}`} className="ui-glass app-person-card">
      <span className="app-person-card__name">{project.name}</span>
      {project.status === 'activo' &&
        (summary.nextTask ? (
          <span className="app-person-card__next">Siguiente: {summary.nextTask.title}</span>
        ) : (
          <span className="app-person-card__next app-project-alert">Sin siguiente paso</span>
        ))}
      {meta && <span className="app-person-card__meta">{meta}</span>}
      {project.dueDate && <span className="app-person-card__meta">Hasta el {dueText(project.dueDate)}</span>}
    </Link>
  );
}

function Cards({ cards }: { cards: ProjectCard[] }) {
  return (
    <ul className="app-person-cards">
      {cards.map((c) => (
        <li key={c.project.id}>
          <Card card={c} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Proyectos: plans with an end (PARA). Active cards first, each with its next step (or a red
 * "Sin siguiente paso"); paused and finished ones folded below.
 */
export function ProyectosScreen({ area, available, active, paused, done }: ProyectosScreenProps) {
  const [open, setOpen] = useState(false);
  return (
    <LargeTitle
      title="Proyectos"
      trailing={
        available ? (
          <button type="button" className="ui-bar-button" aria-label="Nuevo proyecto" onClick={() => setOpen(true)}>
            <PlusIcon />
          </button>
        ) : undefined
      }
    >
      {!available ? (
        <p className="app-empty">{MISSING_MIGRATION}</p>
      ) : (
        <>
          <AreaFilter value={area} />
          {active.length === 0 ? (
            <p className="app-empty">
              Un proyecto junta lo que necesitas para algo con final: un viaje, una reforma, un lanzamiento. Créalo con «+» o
              escribe «&gt;nombre» al capturar.
            </p>
          ) : (
            <Cards cards={active} />
          )}
          {paused.length > 0 && (
            <details className="app-fold">
              <summary className="ui-inset-list__header">En pausa · {paused.length}</summary>
              <Cards cards={paused} />
            </details>
          )}
          {done.length > 0 && (
            <details className="app-fold">
              <summary className="ui-inset-list__header">Terminados · {done.length}</summary>
              <Cards cards={done} />
            </details>
          )}
          <ProjectSheet open={open} onClose={() => setOpen(false)} />
        </>
      )}
    </LargeTitle>
  );
}
