import Link from 'next/link';
import type { ReactNode } from 'react';
import { AreaFilter } from '@/components/app/AreaFilter';
import { HOY_VIEWS, ViewSwitch } from '@/components/app/ViewSwitch';
import { matchesArea, type AreaFilter as Filter } from '@/lib/area';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import type { Digest, DigestDate } from '@/lib/digest/build';
import { formatDay } from '@/lib/format';
import { yearsText } from '@/lib/people/format';
import { RECONNECT_HREF } from '@/lib/nav';
import { formatLongDate, madridToUtc } from '@/lib/time';
import type { Candidate } from '@/lib/resurfacing/candidates';
import { buildDayTimeline } from '@/lib/hoy/timeline';
import { DayTimeline } from './DayTimeline';
import { ParaHoy } from './ParaHoy';
import { PushButton } from './PushButton';

export type HoyScreenProps = {
  digest: Digest;
  /** Replaces `digest.headline` (e.g. the AI line streaming in its own Suspense). */
  headline?: ReactNode;
  tz: string;
  /** VAPID public key (server env); empty hides "Activar notificaciones". */
  vapidPublicKey: string;
  /** What the brain would bring back now (the block at the top); none hides it. */
  paraHoy?: Candidate[];
  /** Which tasks the day shows (citas, dates and Para hoy are not filtered). */
  area?: Filter;
};

/** A section header with either its rows or one quiet line. */
function Section({ header, empty, rows }: { header: string; empty: ReactNode; rows: ReactNode[] }) {
  if (rows.length > 0) return <InsetList header={header}>{rows}</InsetList>;
  return (
    <section className="ui-inset-list">
      <h2 className="ui-inset-list__header">{header}</h2>
      <div className="app-hoy__empty">{empty}</div>
    </section>
  );
}

function dateWhen(d: DigestDate, today: string): string {
  const day = d.daysUntil <= 1 ? formatDay(d.date, today) : `En ${d.daysUntil} días · ${formatDay(d.date, today)}`;
  const years = yearsText(d.yearsSince);
  return years ? `${day} · ${years}` : day;
}

/** "Aniversario · Ainhoa", when, and the person's gift ideas. */
function dateRow(d: DigestDate, today: string) {
  const ideas = d.giftIdeas.map((g) => g.title).join(', ');
  return (
    <Row
      key={`${d.person.id}-${d.dateId ?? 'birthday'}-${d.date}`}
      href={`/personas/${d.person.id}`}
      title={`${d.label} · ${d.person.name}`}
      subtitle={ideas ? `${dateWhen(d, today)} · Ideas: ${ideas}` : dateWhen(d, today)}
      detail={d.giftIdeas.length ? undefined : 'Sin ideas'}
    />
  );
}

/** The morning digest as a screen: readable in ~20 s, one calm section per area. */
export function HoyScreen({ digest, headline, tz, vapidPublicKey, paraHoy = [], area = 'todo' }: HoyScreenProps) {
  const today = digest.date;
  const longDate = formatLongDate(madridToUtc(today, '12:00', tz), tz);

  return (
    <LargeTitle title="Hoy">
      <ViewSwitch label="Periodo" options={HOY_VIEWS} current="/hoy" />
      <AreaFilter value={area} />
      <div className="app-hoy__intro">
        <p className="app-hoy__date">{longDate.charAt(0).toUpperCase() + longDate.slice(1)}</p>
        <p className="app-hoy__headline">{headline ?? digest.headline}</p>
      </div>

      <ParaHoy candidates={paraHoy} />

      {digest.calendarError && (
        <p className="app-hoy__empty app-hoy__empty--solo" role="status">
          {digest.calendarError === 'calendar_auth' ? (
            <>
              No se ha podido leer Google Calendar.{' '}
              <Link href={RECONNECT_HREF} className="app-notice__action">
                Volver a entrar con Google
              </Link>
            </>
          ) : (
            'Google Calendar no responde ahora mismo; faltan las citas.'
          )}
        </p>
      )}

      <DayTimeline
        timeline={buildDayTimeline({ events: digest.events, tasks: digest.dayTasks.filter((t) => matchesArea(t.item.area, area)), tz, dayEndsAt: madridToUtc(today, '23:59', tz) })}
        today={today}
        tz={tz}
      />

      <Section
        header="Próximas fechas"
        rows={digest.dates.map((d) => dateRow(d, today))}
        empty="Ninguna fecha especial en las próximas dos semanas."
      />

      {digest.unclassified > 0 ? (
        <InsetList>
          <Row href="/sin-clasificar" title={`${digest.unclassified} por revisar en la Bandeja`} />
        </InsetList>
      ) : (
        <p className="app-hoy__empty app-hoy__empty--solo">Todo clasificado.</p>
      )}

      {vapidPublicKey && <PushButton publicKey={vapidPublicKey} />}
    </LargeTitle>
  );
}
