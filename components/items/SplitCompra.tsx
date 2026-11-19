'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { splitCompraItem, suggestCompraSplit } from '@/app/actions/compras';
import { InsetList } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import type { Item } from '@/lib/db/types';

type Row = { key: number; title: string; price: string; link: string | null; notes: string | null };
type View =
  | { state: 'loading' }
  | { state: 'error'; error: string }
  | { state: 'ready'; domain: string | null; storeName: string; rows: Row[] };

const priceOf = (text: string): number | null | undefined => {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * "Separar en productos", inside the purchase's sheet: asks the AI what it sees (nothing is saved),
 * shows it as an editable list (rename, set a price, remove what is not a product, change the store)
 * and only on "Separar" creates one purchase per row and archives the original.
 */
export function SplitCompra({ item, onDone }: { item: Item; onDone: () => void }) {
  const [view, setView] = useState<View>({ state: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    settle(() => suggestCompraSplit(item.id), 'No he podido separarlo ahora. Inténtalo dentro de un rato.').then((r) => {
      if (!alive) return;
      if (!r.ok) return setView({ state: 'error', error: r.error });
      const { store, products } = r.value;
      if (products.length < 2) {
        return setView({ state: 'error', error: 'No veo varios productos en esta compra. Si es uno solo, ponle la tienda en su hoja.' });
      }
      setView({
        state: 'ready',
        domain: store?.domain ?? null,
        storeName: store?.name ?? '',
        rows: products.map((p, key) => ({ key, title: p.title, price: p.price === null ? '' : String(p.price).replace('.', ','), link: p.link, notes: p.notes })),
      });
    });
    return () => {
      alive = false;
    };
  }, [item.id]);

  if (view.state === 'loading') return <p className="app-empty" role="status">Leyendo la compra…</p>;
  if (view.state === 'error') return <p className="app-form__error" role="alert">{view.error}</p>;

  const { rows, storeName, domain } = view;
  const update = (key: number, patch: Partial<Row>) =>
    setView({ ...view, rows: rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });
  const named = rows.filter((r) => r.title.trim());

  function confirm() {
    if (inFlight.current) return;
    const products: { title: string; price: number | null; link: string | null; notes: string | null }[] = [];
    for (const r of named) {
      const price = priceOf(r.price);
      if (price === undefined) return setError(`El precio de «${r.title.trim()}» no es válido.`);
      products.push({ title: r.title.trim(), price, link: r.link, notes: r.notes });
    }
    setError(null);
    inFlight.current = true;
    startTransition(async () => {
      const name = storeName.trim();
      const result = await settle(
        () => splitCompraItem(item.id, { store: name ? { name, domain } : null, products }),
        'No se ha podido separar. No se ha cambiado nada.',
      );
      inFlight.current = false;
      startTransition(() => {
        if (result.ok) onDone();
        else setError(result.error);
      });
    });
  }

  return (
    <div className="app-form">
      <InsetList footer="Si la tienda ya existe se usa la que tienes. Déjala vacía para no cambiarla.">
        <label className="app-field">
          <span>Tienda</span>
          <input className="app-input" value={storeName} placeholder="Casio, Amazon…" autoComplete="off" maxLength={80} onChange={(e) => setView({ ...view, storeName: e.target.value })} />
        </label>
      </InsetList>
      <InsetList header={`Productos (${named.length})`} footer="Quita lo que no sea un producto. La compra original se archiva: sigue en Archivo.">
        {rows.map((r, i) => (
          <div className="app-split-row" key={r.key}>
            <input className="app-input" aria-label={`Producto ${i + 1}`} value={r.title} autoComplete="off" maxLength={120} onChange={(e) => update(r.key, { title: e.target.value })} />
            <input className="app-input app-split-row__price" aria-label={`Precio del producto ${i + 1}`} value={r.price} inputMode="decimal" placeholder="€" autoComplete="off" onChange={(e) => update(r.key, { price: e.target.value })} />
            <button type="button" className="ui-bar-button" aria-label={`Quitar el producto ${i + 1}`} onClick={() => setView({ ...view, rows: rows.filter((x) => x.key !== r.key) })}>
              Quitar
            </button>
          </div>
        ))}
      </InsetList>
      {error && (
        <p className="app-form__error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="app-btn app-btn--primary app-btn--block" disabled={pending || named.length < 2} onClick={confirm}>
        {named.length < 2 ? 'Hacen falta al menos dos productos' : `Separar en ${named.length} compras`}
      </button>
    </div>
  );
}
