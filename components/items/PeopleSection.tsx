'use client';

import { InsetList, Row } from '@/components/ui';
import type { Person } from '@/lib/db/types';
import { formatBirthday } from '@/lib/format';

export type PeopleSectionProps = { groups: { person: Person; count: number; summary?: string }[] };

/**
 * Regalos: a view of Personas, not a second list. Only the people who have gift ideas (their
 * ficha is where they are edited), plus a way to all of them. Adding a person lives in Personas.
 */
export function PeopleSection({ groups }: PeopleSectionProps) {
  return (
    <InsetList
      header="Personas con ideas"
      footer={groups.length ? undefined : 'Aún no hay ideas de regalo. Escribe «regalo para Ana: libro de cocina» arriba, o añade una desde la ficha de la persona.'}
    >
      {groups.map(({ person, count, summary }) => (
        <Row
          key={person.id}
          href={`/personas/${person.id}`}
          title={person.name}
          subtitle={[summary, person.birthday ? `Cumple el ${formatBirthday(person.birthday)}` : null].filter(Boolean).join(' · ') || undefined}
          detail={String(count)}
        />
      ))}
      <Row href="/personas" title="Todas las personas" />
    </InsetList>
  );
}
