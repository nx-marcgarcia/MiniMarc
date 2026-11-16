'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { moveItem, toggleDone } from '@/app/actions/items';
import { ItemRow } from '@/components/items/ItemRow';
import { Row, Toast, type ToastProps } from '@/components/ui';
import { settle, type ActionResult } from '@/lib/actions/result';
import type { DigestEvent, DigestTask } from '@/lib/digest/build';
import { formatDue } from '@/lib/format';
import type { DayTimeline as Timeline } from '@/lib/hoy/timeline';
import { itemHref } from '@/lib/items/href';
import { nextOccurrence } from '@/lib/tareas';

export type DayTimelineProps = {
  timeline: Timeline;
  /** Madrid "YYYY-MM-DD". */
  today: string;
  tz: string;
};

type ToastState = NonNullable<ToastProps['toast']>;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/** A section like InsetList, named for assistive tech (`aria-label`). */
function Group({ label, children }: { label: string; children: ReactNode[] }) {
  return (
    <section className="ui-inset-list" aria-label={label}>
      <h2 className="ui-inset-list__header">{label}</h2>
      <ul className="ui-inset-list__group">
        {children.map((child, i) => (
          <li key={i}>{child}</li>
        ))}
      </ul>
    </section>
  );
}

function eventRow(event: DigestEvent, time: string) {
  return <Row title={event.title} detail={time} />;
}

/**
 * Hoy's "Tu día" and "Sin hora": events and timed tasks in one list by time, then the tasks with
 * no time (overdue first). A task's circle completes it in place, with Deshacer, as in Tareas.
 */
export function DayTimeline({ timeline, today }: DayTimelineProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [done, setDone] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? 'Deshacer' : undefined,
      onAction: undo
        ? () =>
            startTransition(async () => {
              const back = await settle(undo, OFFLINE);
              if (!back.ok) showToast(back.error);
            })
        : undefined,
    });
  }

  function complete(item: DigestTask['item']) {
    setDone((d) => [...d, item.id]);
    const next = nextOccurrence(item, new Date());
    startTransition(async () => {
      const result = await settle(() => toggleDone(item.id), OFFLINE);
      if (!result.ok) {
        setDone((d) => d.filter((id) => id !== item.id));
        return showToast(result.error);
      }
      if (next) {
        const { day, time } = formatDue({ dueAt: next, hasTime: item.hasTime }, today);
        showToast(`Hecha. Próxima: ${[day, time].filter(Boolean).join(' a las ')}`, () =>
          moveItem(item.id, { dueAt: item.dueAt, hasTime: item.hasTime }),
        );
      } else {
        showToast('Marcado como hecho', () => toggleDone(item.id));
      }
    });
  }

  function taskRow({ item, overdue }: DigestTask, time?: string) {
    const due = formatDue(item, today);
    const subtitle = [overdue ? `Vencida · ${due.day}` : null, item.area === 'trabajo' ? 'Trabajo' : null].filter(Boolean).join(' · ');
    return (
      <ItemRow
        item={item}
        subtitle={subtitle || undefined}
        detail={time ?? (overdue ? undefined : due.time)}
        checked={done.includes(item.id)}
        onToggle={() => complete(item)}
        onOpen={() => router.push(itemHref(item))}
      />
    );
  }

  const day: ReactNode[] = [
    ...timeline.allDay.map((e) => eventRow(e, 'Todo el día')),
    ...timeline.timed.map((entry) => (entry.kind === 'event' ? eventRow(entry.event, entry.time) : taskRow(entry.task, entry.time))),
  ];
  const untimed = timeline.untimed.map((t) => taskRow(t));

  return (
    <>
      {day.length > 0 ? (
        <Group label="Tu día">{day}</Group>
      ) : (
        <section className="ui-inset-list" aria-label="Tu día">
          <h2 className="ui-inset-list__header">Tu día</h2>
          <div className="app-hoy__empty">Nada con hora hoy.</div>
        </section>
      )}
      {untimed.length > 0 && <Group label="Sin hora">{untimed}</Group>}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
