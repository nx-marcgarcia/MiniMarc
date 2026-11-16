import { InsetList, Row } from '@/components/ui';
import { countdown } from '@/lib/people/format';
import { giftSummary, type Occasion } from '@/lib/regalos';

/**
 * Regalos: the next birthdays and special dates with what is ready for each. When a date is close
 * and nothing is bought, the row says so (role="alert" so a screen reader reads it first).
 */
export function OccasionsSection({ occasions }: { occasions: Occasion[] }) {
  if (occasions.length === 0) return null;
  return (
    <InsetList header="Próximas ocasiones">
      {occasions.map((o) => (
        <Row
          key={`${o.upcoming.person.id}-${o.upcoming.dateId ?? 'birthday'}-${o.upcoming.date}`}
          href={`/personas/${o.upcoming.person.id}`}
          title={`${o.upcoming.person.name} · ${o.upcoming.label}`}
          subtitle={
            <>
              {countdown(o.upcoming.daysUntil)}
              {o.needsGift && (
                <>
                  {' · '}
                  <strong role="alert" className="app-warn">
                    Sin regalo comprado
                  </strong>
                </>
              )}
              {o.bought && ' · Regalo comprado'}
              {o.ideas.length > 0 && ` · ${giftSummary(o.ideas)}`}
            </>
          }
        />
      ))}
    </InsetList>
  );
}
