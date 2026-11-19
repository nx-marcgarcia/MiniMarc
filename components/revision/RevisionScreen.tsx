'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { moveItem, toggleDone } from '@/app/actions/items';
import { setProjectStatus } from '@/app/actions/projects';
import { InsetList, LargeTitle, Toast, type ToastProps } from '@/components/ui';
import { addDays } from '@/lib/agenda/week';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { Item } from '@/lib/db/types';
import { formatDue } from '@/lib/format';
import { REVIEW_KEY, type Review } from '@/lib/revision';
import { madridDateTime, madridToUtc } from '@/lib/time';

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <InsetList header={`${n}. ${title}${done ? ' · Hecho' : ''}`}>
      {children}
    </InsetList>
  );
}

/** A row with buttons on the right (the review's quick decisions). */
function DecisionRow({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="ui-row">
      <span className="ui-row__body">
        <span className="ui-row__text">
          <span className="ui-row__title">{title}</span>
          {subtitle && <span className="ui-row__subtitle">{subtitle}</span>}
        </span>
        <span className="app-review__actions">{children}</span>
      </span>
    </div>
  );
}

/**
 * The weekly review, GTD style, on one screen: 1 Bandeja a cero, 2 every active project with its
 * next step, 3 what is overdue, 4 what was forgotten, 5 next week. Each decision is one tap; a
 * row leaves when it is dealt with. "Terminar revisión" remembers the date on this device.
 */
export function RevisionScreen({ review, today, tz }: { review: Review; today: string; tz: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [finished, setFinished] = useState(false);

  const toastId = useRef(0);
  const showToast = (message: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, message });
  };

  function act(key: string, call: () => Promise<ActionResult<unknown>>) {
    setGone((g) => [...g, key]);
    startTransition(async () => {
      const result = await settle(call, OFFLINE);
      if (!result.ok) {
        setGone((g) => g.filter((k) => k !== key));
        showToast(result.error);
      }
    });
  }

  /** Same wall-clock time, `days` later (from today if it was overdue). */
  function postpone(item: Item, days: number) {
    const time = item.hasTime && item.dueAt ? madridDateTime(new Date(item.dueAt), tz).time : '00:00';
    const dueAt = madridToUtc(addDays(today, days), time, tz).toISOString();
    act(item.id, () => moveItem(item.id, { dueAt, hasTime: item.hasTime }));
  }

  const projects = review.projects.filter((p) => !gone.includes(p.project.id));
  const overdue = review.overdue.filter((i) => !gone.includes(i.id));
  const rescue = review.rescue.filter((i) => !gone.includes(i.id));
  const looseIdeas = review.tidy.looseIdeas.filter((i) => !gone.includes(i.id));

  return (
    <LargeTitle title="Revisión semanal">
      <p className="app-hoy__date app-review__intro">Diez minutos para dejarlo todo en su sitio y empezar la semana con la cabeza despejada.</p>

      <Step n={1} title="Bandeja a cero" done={review.inbox === 0}>
        {review.inbox > 0 ? (
          <DecisionRow title={`${review.inbox} por revisar`}>
            <Link href="/sin-clasificar" className="app-btn app-btn--tint">
              Procesar
            </Link>
          </DecisionRow>
        ) : (
          <DecisionRow title="Nada por revisar" />
        )}
      </Step>

      <Step n={2} title="Proyectos" done={projects.length === 0}>
        {projects.length === 0 && <DecisionRow title="No hay proyectos activos" />}
        {projects.map(({ project, nextTask }) => (
          <DecisionRow key={project.id} title={project.name} subtitle={nextTask ? `Siguiente: ${nextTask.title}` : 'Sin siguiente paso'}>
            <Link href={`/proyectos/${project.id}`} className="app-btn app-btn--ghost">
              Abrir
            </Link>
            <button type="button" className="app-btn app-btn--ghost" aria-label={`Pausar: ${project.name}`} onClick={() => act(project.id, () => setProjectStatus(project.id, 'en_pausa'))}>
              Pausar
            </button>
            <button type="button" className="app-btn app-btn--ghost" aria-label={`Terminar: ${project.name}`} onClick={() => act(project.id, () => setProjectStatus(project.id, 'terminado'))}>
              Terminar
            </button>
          </DecisionRow>
        ))}
      </Step>

      <Step n={3} title="Atrasado" done={overdue.length === 0}>
        {overdue.length === 0 && <DecisionRow title="Nada atrasado" />}
        {overdue.map((item) => (
          <DecisionRow key={item.id} title={item.title} subtitle={`${formatDue(item, today).day}${item.area === 'trabajo' ? ' · Trabajo' : ''}`}>
            <button type="button" className="app-btn app-btn--tint" aria-label={`Hecho: ${item.title}`} onClick={() => act(item.id, () => toggleDone(item.id))}>
              Hecho
            </button>
            <button type="button" className="app-btn app-btn--ghost" aria-label={`Mañana: ${item.title}`} onClick={() => postpone(item, 1)}>
              Mañana
            </button>
            <button type="button" className="app-btn app-btn--ghost" aria-label={`Próxima semana: ${item.title}`} onClick={() => postpone(item, 7)}>
              +1 semana
            </button>
          </DecisionRow>
        ))}
      </Step>

      <Step n={4} title="Rescatar lo olvidado" done={rescue.length === 0}>
        {rescue.length === 0 && <DecisionRow title="Nada olvidado" />}
        {rescue.map((item) => (
          <DecisionRow key={item.id} title={item.title} subtitle={item.type === 'idea' ? 'Idea sin tocar' : 'Enlace sin ver'}>
            <button type="button" className="app-btn app-btn--ghost" aria-label={`Mantener: ${item.title}`} onClick={() => setGone((g) => [...g, item.id])}>
              Mantener
            </button>
            <button type="button" className="app-btn app-btn--danger" aria-label={`Archivar: ${item.title}`} onClick={() => act(item.id, () => moveItem(item.id, { archived: true }))}>
              Archivar
            </button>
          </DecisionRow>
        ))}
      </Step>

      <Step n={5} title="La semana que viene" done={false}>
        <DecisionRow title="Citas, tareas y fechas de la semana">
          <Link href={`/semana?w=${review.nextWeekStart}`} className="app-btn app-btn--tint">
            Ver la semana que viene
          </Link>
        </DecisionRow>
      </Step>

      {(looseIdeas.length > 0 || review.tidy.noStore > 0) && (
        <InsetList header="Ordenar lo antiguo" footer="Solo se pregunta; no se cambia nada sin que lo decidas.">
          {looseIdeas.map((item) => (
            <DecisionRow key={item.id} title={item.title} subtitle="En Ideas, pero suena a una tarea">
              <button type="button" className="app-btn app-btn--tint" aria-label={`Es una tarea: ${item.title}`} onClick={() => act(item.id, () => moveItem(item.id, { type: 'tarea' }))}>
                Es una tarea
              </button>
              <button type="button" className="app-btn app-btn--ghost" aria-label={`Es una idea: ${item.title}`} onClick={() => setGone((g) => [...g, item.id])}>
                Es una idea
              </button>
              <button type="button" className="app-btn app-btn--danger" aria-label={`Archivar: ${item.title}`} onClick={() => act(item.id, () => moveItem(item.id, { archived: true }))}>
                Archivar
              </button>
            </DecisionRow>
          ))}
          {review.tidy.noStore > 0 && (
            <DecisionRow
              title={`${review.tidy.noStore} ${review.tidy.noStore === 1 ? 'compra' : 'compras'} sin tienda`}
              subtitle="Ponles tienda para verlas agrupadas, o sepáralas si son varios productos"
            >
              <Link href="/compras" className="app-btn app-btn--tint">
                Abrir Compras
              </Link>
            </DecisionRow>
          )}
        </InsetList>
      )}

      <div className="app-review__finish">
        <button
          type="button"
          className="app-btn app-btn--primary app-btn--block"
          disabled={finished}
          onClick={() => {
            localStorage.setItem(REVIEW_KEY, new Date().toISOString());
            setFinished(true);
            showToast('Revisión hecha. ¡Buena semana!');
            router.refresh();
          }}
        >
          {finished ? 'Revisión hecha' : 'Terminar revisión'}
        </button>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </LargeTitle>
  );
}
