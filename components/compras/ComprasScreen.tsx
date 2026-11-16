'use client';

import { useRef, useState, type ReactNode } from 'react';
import { moveItem, toggleDone } from '@/app/actions/items';
import { ItemsScreen } from '@/components/items/ItemsScreen';
import { InsetList, Row, Segmented, Toast, type ToastProps } from '@/components/ui';
import { settle } from '@/lib/actions/result';
import { formatMoney, groupByStore, groupByUrgency, priceText, type CompraGroup, type StoreInfo } from '@/lib/compras';
import type { Item } from '@/lib/db/types';
import type { PhotoMap } from '@/lib/photos/view';

export type ComprasScreenProps = {
  today: string;
  /** Open purchases (quiero, en el carrito). */
  items: Item[];
  /** Bought or discarded, newest first. */
  history: Item[];
  stores: StoreInfo[];
  photos?: PhotoMap;
};

type Mode = 'tienda' | 'urgencia' | 'historial';
type ToastState = NonNullable<ToastProps['toast']>;

const MODES = [
  { value: 'tienda', label: 'Por tienda' },
  { value: 'urgencia', label: 'Por urgencia' },
  { value: 'historial', label: 'Historial' },
] as const;

const EMPTY = 'No hay nada en la lista. Prueba a escribir arriba «Aliexpress: masaje de cabeza, cajón organizador de calcetines» o pega el enlace de un producto.';
const OFFLINE = 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';

const count = (n: number) => `${n} ${n === 1 ? 'compra' : 'compras'}`;

/** The header of a section: fold button with the store's logo, how many purchases and the estimated total. */
function GroupHeader({ group, collapsed, onToggle }: { group: CompraGroup; collapsed: boolean; onToggle: () => void }) {
  const { total, store } = group;
  return (
    <button
      type="button"
      className="app-group-header"
      aria-expanded={!collapsed}
      aria-label={`${group.title}, ${count(group.items.length)}${total ? `, ${total.unpriced > 0 ? 'al menos ' : ''}${formatMoney(total.amount, total.currency)}` : ''}`}
      onClick={onToggle}
    >
      <span className="app-group-header__chevron" aria-hidden>
        {collapsed ? '▸' : '▾'}
      </span>
      {store?.favicon && (
        // eslint-disable-next-line @next/next/no-img-element -- the store's own favicon, no optimizer
        <img className="app-group-header__logo" src={store.favicon} alt="" width={18} height={18} loading="lazy" />
      )}
      <span className="app-group-header__title">{group.title}</span>
      <span className="app-group-header__count">{group.items.length}</span>
      {total && (
        <span className="app-group-header__total" title={total.unpriced > 0 ? `Faltan ${count(total.unpriced)} sin precio` : undefined}>
          {total.unpriced > 0 ? '≥ ' : ''}
          {formatMoney(total.amount, total.currency)}
        </span>
      )}
    </button>
  );
}

/** "En la tienda": a big list to tick off while shopping. Tapping marks bought, tapping again puts it back. */
function ShoppingMode({ items, stores, onExit }: { items: Item[]; stores: StoreInfo[]; onExit: () => void }) {
  const [storeId, setStoreId] = useState('');
  const [bought, setBought] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const shown = groupByStore(storeId ? items.filter((i) => i.storeId === storeId) : items, stores);

  async function tap(item: Item) {
    setBought((b) => (b.includes(item.id) ? b.filter((id) => id !== item.id) : [...b, item.id]));
    const result = await settle(() => toggleDone(item.id), OFFLINE);
    if (!result.ok) {
      setBought((b) => (b.includes(item.id) ? b.filter((id) => id !== item.id) : [...b, item.id]));
      toastId.current += 1;
      setToast({ id: toastId.current, message: result.error });
    }
  }

  return (
    <>
      <section className="ui-glass app-shopping" role="region" aria-label="En la tienda">
        <div className="app-shopping__bar">
          <label className="app-field">
            <span>Tienda</span>
            <select className="app-input" aria-label="Tienda" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas</option>
              {stores
                .filter((s) => items.some((i) => i.storeId === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className="app-btn app-btn--tint" onClick={onExit}>
            Salir
          </button>
        </div>
        {shown.length === 0 && <p className="app-empty">No queda nada por comprar aquí.</p>}
        {shown.map((group) => (
          <div key={group.key}>
            <h3 className="app-shopping__store">{group.title}</h3>
            <ul className="app-shopping__list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="app-shopping__item" aria-pressed={bought.includes(item.id)} onClick={() => void tap(item)}>
                    {item.title}
                  </button>
                  <span className="app-shopping__detail">
                    {[priceText(item), !storeId && item.storeId ? names.get(item.storeId) : null].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function History({ items, stores }: { items: Item[]; stores: StoreInfo[] }) {
  const [back, setBack] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const shown = items.filter((i) => !back.includes(i.id));

  async function restore(item: Item) {
    setBack((b) => [...b, item.id]);
    const result = await settle(() => moveItem(item.id, { status: 'quiero' }), OFFLINE);
    if (!result.ok) {
      setBack((b) => b.filter((id) => id !== item.id));
      toastId.current += 1;
      setToast({ id: toastId.current, message: result.error });
    }
  }

  if (shown.length === 0) return <p className="app-empty">Aquí aparecerá lo que compres: al marcar una compra como comprada pasa a este historial.</p>;
  return (
    <>
      <InsetList header="Comprado">
        {shown.map((item) => (
          <Row
            key={item.id}
            title={item.title}
            subtitle={[item.storeId ? names.get(item.storeId) : null, item.status === 'descartado' ? 'Descartado' : null].filter(Boolean).join(' · ') || undefined}
            detail={priceText(item) ?? undefined}
            trailing={
              <button type="button" className="app-btn app-btn--tint" aria-label={`Volver a la lista «${item.title}»`} onClick={() => void restore(item)}>
                Volver
              </button>
            }
          />
        ))}
      </InsetList>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

/**
 * Compras: grouped by store (folding sections with the store's logo, how many and the estimated
 * total) or by urgency, the "En la tienda" mode for ticking things off while shopping, and the
 * history of what was bought.
 */
export function ComprasScreen({ today, items, history, stores, photos = {} }: ComprasScreenProps) {
  const [mode, setMode] = useState<Mode>('tienda');
  const [shopping, setShopping] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const storeNames = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  if (shopping) return <ShoppingMode items={items} stores={stores} onExit={() => setShopping(false)} />;

  const groups = mode === 'tienda' ? groupByStore(items, stores) : mode === 'urgencia' ? groupByUrgency(items) : [];
  const toggle = (key: string) => setCollapsed((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const before: ReactNode = (
    <>
      <div className="app-form__segmented">
        <Segmented label="Vista" options={[...MODES]} value={mode} onChange={setMode} />
      </div>
      {items.length > 0 && mode !== 'historial' && (
        <div className="app-shop-cta">
          <button type="button" className="app-btn app-btn--primary app-btn--block" aria-label="En la tienda" onClick={() => setShopping(true)}>
            En la tienda · {items.length} por comprar
          </button>
        </div>
      )}
      {mode === 'historial' && <History items={history} stores={stores} />}
    </>
  );

  return (
    <ItemsScreen
      title="Compras"
      today={today}
      before={before}
      sections={groups.map((g) => ({
        key: g.key,
        header: <GroupHeader group={g} collapsed={collapsed.includes(g.key)} onToggle={() => toggle(g.key)} />,
        items: g.items,
        collapsed: collapsed.includes(g.key),
      }))}
      emptyText={mode === 'historial' ? undefined : EMPTY}
      newItem={{ type: 'compra', label: 'Nueva compra' }}
      photos={photos}
      storeNames={storeNames}
      showStore={mode === 'urgencia'}
    />
  );
}
