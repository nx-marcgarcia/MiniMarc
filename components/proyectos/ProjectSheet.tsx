'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { createProject, updateProject } from '@/app/actions/projects';
import { InsetList, Sheet } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import type { Project } from '@/lib/db/projects';

const FORM_ID = 'project-sheet-form';
const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** New project (then opens it) or edit one: name, area, deadline and notes. */
export function ProjectSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get('name') ?? '').trim()) return setError('Ponle un nombre.');
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const result = await settle(() => (project ? updateProject(project.id, fd) : createProject(fd)), OFFLINE);
      inFlight.current = false;
      if (!result.ok) return setError(result.error);
      onClose();
      if (project) router.refresh();
      else router.push(`/proyectos/${result.value.id}`);
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={project ? 'Editar proyecto' : 'Nuevo proyecto'}
      leading={
        <button type="button" className="ui-bar-button" onClick={onClose}>
          Cancelar
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} className="ui-bar-button ui-bar-button--strong" disabled={pending}>
          {project ? 'OK' : 'Crear'}
        </button>
      }
    >
      <form key={`${project?.id ?? 'new'}-${String(open)}`} id={FORM_ID} onSubmit={handleSubmit} className="app-form">
        <InsetList>
          <input
            className="app-input app-input--title"
            name="name"
            defaultValue={project?.name}
            placeholder="Viaje a Japón, Reforma del baño…"
            aria-label="Nombre"
            autoComplete="off"
            enterKeyHint="done"
          />
          <textarea className="app-input app-input--notes" name="notes" defaultValue={project?.notes ?? ''} placeholder="Notas: el objetivo, cómo sabrás que está hecho" aria-label="Notas" rows={3} />
        </InsetList>
        <InsetList footer="Lo de un proyecto de Trabajo nunca pasa por la IA.">
          <label className="app-field">
            <span>Área</span>
            <select className="app-input" name="area" defaultValue={project?.area ?? ''}>
              <option value="">Las dos</option>
              <option value="personal">Personal</option>
              <option value="trabajo">Trabajo</option>
            </select>
          </label>
          <label className="app-field">
            <span>Fecha límite</span>
            <input className="app-input" type="date" name="dueDate" defaultValue={project?.dueDate ?? ''} />
          </label>
        </InsetList>
        {error && (
          <p className="app-form__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
