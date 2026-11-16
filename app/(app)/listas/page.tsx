import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BagIcon, BookIcon, GiftIcon, GlobeIcon, IdeaIcon, NoteIcon, SettingsIcon } from '@/components/icons';
import { InsetList, LargeTitle, Row } from '@/components/ui';
import { readListCounts } from '@/lib/cache/reads';

export const metadata: Metadata = { title: 'Listas' };

type Counts = Awaited<ReturnType<typeof readListCounts>>;

export default function ListasPage() {
  return (
    <LargeTitle title="Listas">
      <Suspense fallback={<Hub counts={null} />}>
        <HubWithCounts />
      </Suspense>
    </LargeTitle>
  );
}

async function HubWithCounts() {
  return <Hub counts={await readListCounts()} />;
}

const tile = (icon: React.ReactNode) => <span className="ui-icon-tile">{icon}</span>;
const count = (n: number | undefined) => (n ? String(n) : undefined);

/**
 * Every collection, grouped by what you do with it (same groups as the sidebar). Tasks, the
 * Bandeja and the calendar are tabs of their own, so they are not repeated here.
 */
function Hub({ counts }: { counts: Counts | null }) {
  return (
    <>
      <InsetList header="Por conseguir">
        <Row href="/compras" leading={tile(<BagIcon />)} title="Compras" subtitle="Lo que quieres comprar, por tienda" detail={count(counts?.compras)} />
        <Row
          href="/personas"
          leading={tile(<GiftIcon />)}
          title="Personas y regalos"
          subtitle="Cumpleaños, fechas e ideas de regalo"
          detail={count(counts?.regalos)}
        />
      </InsetList>
      <InsetList header="Para leer y ver">
        <Row href="/libros" leading={tile(<BookIcon />)} title="Libros" subtitle="Por leer y leyendo" detail={count(counts?.libros)} />
        <Row href="/enlaces" leading={tile(<GlobeIcon />)} title="Enlaces" subtitle="Artículos y vídeos para más tarde" detail={count(counts?.enlaces)} />
      </InsetList>
      <InsetList header="Para pensar">
        <Row href="/ideas" leading={tile(<IdeaIcon />)} title="Ideas" subtitle="De semilla a en marcha" detail={count(counts?.ideas)} />
        <Row href="/notas" leading={tile(<NoteIcon />)} title="Notas" subtitle="Datos y apuntes que quieres guardar" detail={count(counts?.notas)} />
      </InsetList>
      <InsetList>
        <Row href="/ajustes" leading={tile(<SettingsIcon />)} title="Ajustes" subtitle="Avisos, Telegram, iPhone y copia de seguridad" />
      </InsetList>
    </>
  );
}
