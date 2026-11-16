import { InsetList, Row } from '@/components/ui';
import { historyText, type HistoryRow } from '@/lib/regalos';

/** What was already given to this person, newest first, so nothing is given twice. Nothing when empty. */
export function GiftHistory({ rows }: { rows: HistoryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <InsetList header="Regalos entregados">
      {rows.map((r) => (
        <Row key={r.id} title={r.title} subtitle={historyText(r)} />
      ))}
    </InsetList>
  );
}
