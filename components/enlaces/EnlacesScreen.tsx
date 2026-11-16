'use client';

import { useRef, useState } from 'react';
import { deleteItem, toggleDone, undoDelete } from '@/app/actions/items';
import { InsetList, LargeTitle, Segmented, Toast, type ToastProps } from '@/components/ui';
import { settle, type ActionResult } from '@/lib/actions/result';
import { domainsIn, filterCards, kindsIn, type EnlaceCard } from '@/lib/enlaces';

type ToastState = NonNullable<ToastProps['toast']>;
type Tab = 'porver' | 'vistos';

const TABS = [
  { value: 'porver', label: 'Por ver' },
  { value: 'vistos', label: 'Vistos' },
] as const;

const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

/**
 * Enlaces: everything saved to see later, newest first, with the page's preview, type and domain.
 * Por ver / Vistos, filters by type and domain (only when there is something to filter), and per link:
 * mark seen (and back), delete (both with Deshacer). The title opens the link in a new tab.
 */
export function EnlacesScreen({ cards }: { cards: EnlaceCard[] }) {
  const [tab, setTab] = useState<Tab>('porver');
  const [kind, setKind] = useState('');
  const [domain, setDomain] = useState('');
  /** Handled links, hidden at once; they come back if the write fails or is undone. */
  const [gone, setGone] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  const live = cards.filter((c) => !gone.includes(c.item.id));
  const inTab = filterCards(live, { seen: tab === 'vistos' });
  const kinds = kindsIn(inTab);
  const domains = domainsIn(inTab);
  const shown = filterCards(live, { seen: tab === 'vistos', kind: kind || undefined, domain: domain || undefined });

  function showToast(message: string, undo?: () => Promise<ActionResult<unknown>>, undoneId?: string) {
    toastId.current += 1;
    setToast({
      id: toastId.current,
      message,
      actionLabel: undo ? 'Deshacer' : undefined,
      onAction: undo
        ? () =>
            void (async () => {
              const back = await settle(undo, OFFLINE);
              if (back.ok && undoneId) setGone((g) => g.filter((id) => id !== undoneId));
              else if (!back.ok) showToast(back.error);
            })()
        : undefined,
    });
  }

  /** Hides the card, runs the write, and offers to undo it; the card returns if the write fails. */
  async function resolve(card: EnlaceCard, action: () => Promise<ActionResult<unknown>>, message: string, undo: () => Promise<ActionResult<unknown>>) {
    const id = card.item.id;
    setGone((g) => [...g, id]);
    const result = await settle(action, OFFLINE);
    if (!result.ok) {
      setGone((g) => g.filter((x) => x !== id));
      return showToast(result.error);
    }
    showToast(message, undo, id);
  }

  return (
    <>
      <LargeTitle title="Enlaces">
        <div className="app-form__segmented">
          <Segmented label="Vista" options={[...TABS]} value={tab} onChange={(t) => (setTab(t), setKind(''), setDomain(''))} />
        </div>

        {(kinds.length > 1 || domains.length > 1) && (
          <div className="app-filters">
            {kinds.length > 1 && (
              <select className="app-chip" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Todos los tipos</option>
                {kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label} ({k.count})
                  </option>
                ))}
              </select>
            )}
            {domains.length > 1 && (
              <select className="app-chip" aria-label="Dominio" value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="">Todos los sitios</option>
                {domains.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value} ({d.count})
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {shown.length > 0 ? (
          <InsetList>
            {shown.map((card) => {
              const { item } = card;
              const meta = [card.kindLabel, card.domain].filter(Boolean).join(' · ');
              return (
                <div key={item.id} className="ui-row app-enlace">
                  {card.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- the page's own preview image, no optimizer
                    <img className="app-enlace__thumb" src={card.image} alt="" width={64} height={64} loading="lazy" decoding="async" />
                  )}
                  <div className="app-enlace__body">
                    {card.url ? (
                      <a className="app-enlace__title" href={card.url} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                    ) : (
                      <span className="app-enlace__title">{item.title}</span>
                    )}
                    {meta && <span className="app-enlace__meta">{meta}</span>}
                    <span className="app-enlace__actions">
                      {tab === 'porver' ? (
                        <button
                          type="button"
                          className="ui-bar-button"
                          aria-label={`Marcar «${item.title}» como visto`}
                          onClick={() => void resolve(card, () => toggleDone(item.id), 'Marcado como visto', () => toggleDone(item.id))}
                        >
                          Visto
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ui-bar-button"
                          aria-label={`Volver «${item.title}» a por ver`}
                          onClick={() => void resolve(card, () => toggleDone(item.id), 'Vuelve a Por ver', () => toggleDone(item.id))}
                        >
                          Volver a por ver
                        </button>
                      )}
                      <button
                        type="button"
                        className="ui-bar-button"
                        aria-label={`Eliminar «${item.title}»`}
                        onClick={() => void resolve(card, () => deleteItem(item.id), 'Eliminado', () => undoDelete(item.id))}
                      >
                        Eliminar
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </InsetList>
        ) : (
          <p className="app-empty">
            {tab === 'porver'
              ? 'No hay nada por ver. Pega un enlace en la barra de arriba (un vídeo de YouTube, un artículo, un hilo) y se guarda aquí con su vista previa.'
              : 'Aquí irán los enlaces que marques como vistos.'}
          </p>
        )}
      </LargeTitle>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
