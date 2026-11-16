'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setProjectStatus } from '@/app/actions/projects';
import { ChevronLeftIcon } from '@/components/icons';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { Segmented } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type Project, type ProjectStatus } from '@/lib/db/projects';
import type { Item, ItemType, Person } from '@/lib/db/types';
import { ITEM_TYPES } from '@/lib/items/itemTypes';
import type { PhotoMap } from '@/lib/photos/view';
import type { ProjectSummary } from '@/lib/projects';
import { ProjectSheet } from './ProjectSheet';

export type ProyectoScreenProps = {
  project: Project;
  /** Open items by type, only the types it has (readProyecto). */
  sections: { type: ItemType; items: Item[] }[];
  summary: ProjectSummary;
  people: Person[];
  photos: PhotoMap;
  today: string;
};

const back = (
  <Link href="/proyectos" className="ui-bar-button app-back">
    <ChevronLeftIcon />
    Proyectos
  </Link>
);

/**
 * A project's page: its state (Activo | En pausa | Terminado), notes, and everything in it by
 * type with the usual rows; "+" adds a task already inside. Finishing never touches its items.
 */
export function ProyectoScreen({ project, sections, summary, people, photos, today }: ProyectoScreenProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeStatus(next: ProjectStatus) {
    const previous = status;
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const result = await settle(() => setProjectStatus(project.id, next), 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.');
      if (!result.ok) {
        setStatus(previous);
        setError(result.error);
      } else router.refresh();
    });
  }

  const header = (
    <>
      <div className="app-segmented">
        <Segmented
          label="Estado del proyecto"
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
          value={status}
          onChange={changeStatus}
        />
      </div>
      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="app-hoy__intro">
        {project.notes && <p className="app-hoy__headline">{project.notes}</p>}
        <p className="app-hoy__date">
          {[project.area === 'trabajo' ? 'Trabajo' : project.area === 'personal' ? 'Personal' : null, project.dueDate ? `Hasta el ${project.dueDate.split('-').reverse().join('/')}` : null]
            .filter(Boolean)
            .join(' · ')}{' '}
          <button type="button" className="app-btn app-btn--ghost" onClick={() => setEditing(true)}>
            Editar proyecto
          </button>
        </p>
        {status === 'activo' && summary.needsNextStep && (
          <p className="app-notice" role="status">
            Sin siguiente paso: añade la próxima tarea con «+».
          </p>
        )}
      </div>
      <ProjectSheet open={editing} onClose={() => setEditing(false)} project={project} />
    </>
  );

  return (
    <ItemsScreen
      key={project.id}
      title={project.name}
      leading={back}
      today={today}
      before={header}
      sections={sections.map((s) => ({ key: s.type, header: ITEM_TYPES[s.type].plural, items: s.items, takesNew: s.type === 'tarea' }))}
      emptyText="Aún no hay nada en este proyecto. Añade una tarea con «+», o captura con «>nombre»."
      people={people}
      photos={photos}
      showArea
      newItem={{ type: 'tarea', projectId: project.id, area: project.area ?? undefined, label: 'Nueva tarea del proyecto' }}
    />
  );
}
